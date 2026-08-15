<?php

namespace App\Services\Crm\Agent\Tools;

use App\Models\Crm\Activity;
use App\Models\Crm\Task;
use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\GoogleCalendarClient;
use Carbon\Carbon;
use RuntimeException;
use Throwable;

class CriarAgendamentoTool implements AgentTool
{
    public function __construct(private GoogleCalendarClient $calendar) {}

    public function name(): string
    {
        return 'criar_agendamento';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Cria (ou remarca) um agendamento: Task no CRM + evento no Google Calendar. Por padrão cancela agendamentos pendentes anteriores deste lead criados pelo agent (remarcação). Use horários ISO-8601 (fuso America/Sao_Paulo).',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'titulo' => [
                        'type' => 'string',
                        'description' => 'Título do agendamento',
                    ],
                    'inicio' => [
                        'type' => 'string',
                        'description' => 'Início em ISO-8601',
                    ],
                    'fim' => [
                        'type' => 'string',
                        'description' => 'Fim em ISO-8601',
                    ],
                    'descricao' => [
                        'type' => 'string',
                        'description' => 'Descrição opcional',
                    ],
                    'manter_anteriores' => [
                        'type' => 'boolean',
                        'description' => 'Se true, NÃO cancela agendamentos anteriores do lead. Default false (remarca/substitui).',
                    ],
                ],
                'required' => ['titulo', 'inicio', 'fim'],
            ],
        ];
    }

    public function handle(array $arguments, AgentContext $context): array
    {
        $titulo = trim((string) ($arguments['titulo'] ?? ''));
        $inicioRaw = trim((string) ($arguments['inicio'] ?? ''));
        $fimRaw = trim((string) ($arguments['fim'] ?? ''));
        $descricao = trim((string) ($arguments['descricao'] ?? ''));
        $manterAnteriores = (bool) ($arguments['manter_anteriores'] ?? false);

        if ($titulo === '' || $inicioRaw === '' || $fimRaw === '') {
            throw new RuntimeException('titulo, inicio e fim são obrigatórios.');
        }

        try {
            $inicio = Carbon::parse($inicioRaw, config('app.timezone'));
            $fim = Carbon::parse($fimRaw, config('app.timezone'));
        } catch (Throwable) {
            throw new RuntimeException('inicio/fim inválidos. Use ISO-8601.');
        }

        if ($fim->lessThanOrEqualTo($inicio)) {
            throw new RuntimeException('fim deve ser posterior a inicio.');
        }
        if ($inicio->lessThan(now()->subMinutes(5))) {
            throw new RuntimeException('Não agende no passado.');
        }

        $cancelados = [];
        if (! $manterAnteriores && $context->lead) {
            $cancelados = $this->cancelarAgendamentosPendentesDoLead($context);
        }

        $taskDescription = $descricao !== '' ? $descricao : null;

        $task = Task::create([
            'title' => $titulo,
            'description' => $taskDescription,
            'due_at' => $inicio,
            'lead_id' => $context->lead?->id,
            'deal_id' => $context->deal?->id,
            'user_id' => $context->user->id,
        ]);

        $calendarResult = null;
        $calendarError = null;

        try {
            $calendarResult = $this->calendar->createEvent([
                'summary' => $titulo,
                'description' => $this->calendarDescription($context, $descricao),
                'start' => $inicio->toIso8601String(),
                'end' => $fim->toIso8601String(),
            ]);

            $extra = [];
            if (! empty($calendarResult['htmlLink'])) {
                $extra[] = 'Google Calendar: '.$calendarResult['htmlLink'];
            }
            if (! empty($calendarResult['id'])) {
                $extra[] = 'event_id: '.$calendarResult['id'];
            }
            if ($extra !== []) {
                $task->forceFill([
                    'description' => trim(($task->description ? $task->description."\n\n" : '').implode("\n", $extra)),
                ])->save();
            }
        } catch (Throwable $e) {
            $calendarError = $e->getMessage();
        }

        Activity::create([
            'type' => 'task',
            'subject' => 'Agendamento criado pelo agent: '.$titulo,
            'body' => $descricao !== '' ? $descricao : null,
            'due_at' => $inicio,
            'lead_id' => $context->lead?->id,
            'deal_id' => $context->deal?->id,
            'user_id' => $context->user->id,
            'meta' => [
                'task_id' => $task->id,
                'google_event_id' => $calendarResult['id'] ?? null,
                'google_html_link' => $calendarResult['htmlLink'] ?? null,
                'calendar_error' => $calendarError,
                'agent_id' => $context->agent->id,
                'replaced_task_ids' => array_column($cancelados, 'task_id'),
                'replaced_event_ids' => array_values(array_filter(array_column($cancelados, 'google_event_id'))),
            ],
        ]);

        return [
            'ok' => true,
            'task_id' => $task->id,
            'titulo' => $titulo,
            'inicio' => $inicio->toIso8601String(),
            'fim' => $fim->toIso8601String(),
            'google_event_id' => $calendarResult['id'] ?? null,
            'google_html_link' => $calendarResult['htmlLink'] ?? null,
            'calendar_error' => $calendarError,
            'cancelados' => $cancelados,
            'remarcacao' => $cancelados !== [],
        ];
    }

    /**
     * Cancela tasks pendentes + eventos Google de agendamentos anteriores do agent neste lead.
     *
     * @return list<array{task_id: int, google_event_id: ?string, titulo: string}>
     */
    private function cancelarAgendamentosPendentesDoLead(AgentContext $context): array
    {
        $leadId = $context->lead?->id;
        if (! $leadId) {
            return [];
        }

        $activities = Activity::query()
            ->where('lead_id', $leadId)
            ->where('type', 'task')
            ->where('subject', 'like', 'Agendamento criado pelo agent:%')
            ->latest('id')
            ->limit(20)
            ->get();

        $cancelados = [];
        $seenTasks = [];

        foreach ($activities as $activity) {
            $meta = is_array($activity->meta) ? $activity->meta : [];
            $taskId = isset($meta['task_id']) ? (int) $meta['task_id'] : 0;
            if ($taskId <= 0 || isset($seenTasks[$taskId])) {
                continue;
            }
            $seenTasks[$taskId] = true;

            $task = Task::query()->find($taskId);
            if (! $task || $task->isDone()) {
                continue;
            }

            // Só cancela futuros ou do dia atual (agendamentos “ativos”).
            if ($task->due_at && $task->due_at->lt(now()->startOfDay())) {
                continue;
            }

            $eventId = filled($meta['google_event_id'] ?? null)
                ? (string) $meta['google_event_id']
                : $this->extractEventIdFromDescription((string) ($task->description ?? ''));

            $calendarDeleteError = null;
            if ($eventId) {
                try {
                    $this->calendar->deleteEvent($eventId);
                } catch (Throwable $e) {
                    $calendarDeleteError = $e->getMessage();
                }
            }

            $task->forceFill([
                'done_at' => now(),
                'description' => trim(
                    (string) ($task->description ?? '')
                    ."\n\n[Cancelado pelo agent — remarcação]"
                    .($calendarDeleteError ? "\nCalendar: ".$calendarDeleteError : '')
                ),
            ])->save();

            Activity::create([
                'type' => 'task',
                'subject' => 'Agendamento cancelado pelo agent (remarcação): '.$task->title,
                'body' => 'Substituído por um novo horário.',
                'lead_id' => $leadId,
                'deal_id' => $context->deal?->id,
                'user_id' => $context->user->id,
                'meta' => [
                    'task_id' => $task->id,
                    'google_event_id' => $eventId,
                    'calendar_delete_error' => $calendarDeleteError,
                    'agent_id' => $context->agent->id,
                    'cancelled_for_reschedule' => true,
                ],
            ]);

            $cancelados[] = [
                'task_id' => $task->id,
                'google_event_id' => $eventId,
                'titulo' => (string) $task->title,
            ];
        }

        return $cancelados;
    }

    private function extractEventIdFromDescription(string $description): ?string
    {
        if (preg_match('/event_id:\s*(\S+)/u', $description, $m) === 1) {
            return trim($m[1]);
        }

        return null;
    }

    private function calendarDescription(AgentContext $context, string $descricao): string
    {
        $parts = [];
        if ($descricao !== '') {
            $parts[] = $descricao;
        }
        if ($context->lead) {
            $parts[] = 'Lead: '.$context->lead->name.' (#'.$context->lead->id.')';
            if ($context->lead->mobile) {
                $parts[] = 'Telefone: '.$context->lead->mobile;
            }
        }
        $parts[] = 'Criado pelo agent WhatsApp: '.$context->agent->name;

        return implode("\n", $parts);
    }
}
