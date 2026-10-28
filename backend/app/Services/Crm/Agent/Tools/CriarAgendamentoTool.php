<?php

namespace App\Services\Crm\Agent\Tools;

use App\Models\Crm\Appointment;
use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\Appointments\ScheduleAppointment;
use RuntimeException;

class CriarAgendamentoTool implements AgentTool
{
    public function __construct(private ScheduleAppointment $schedule) {}

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

        if (! $context->lead) {
            throw new RuntimeException('Não há lead associado a esta conversa para agendar.');
        }

        $result = $this->schedule->handle(
            $context->lead,
            [
                'title' => $titulo,
                'starts_at' => $inicioRaw,
                'ends_at' => $fimRaw,
                'notes' => $descricao,
                'origin_label' => 'Criado pelo agent WhatsApp: '.$context->agent->name,
            ],
            $context->user->id,
            Appointment::SOURCE_AI,
            null,
            ! $manterAnteriores,
            ['agent_id' => $context->agent->id],
        );

        $appointment = $result['appointment'];

        return [
            'ok' => true,
            'appointment_id' => $appointment->id,
            'task_id' => $result['task']->id,
            'titulo' => $titulo,
            'inicio' => $appointment->starts_at?->toIso8601String(),
            'fim' => $appointment->ends_at?->toIso8601String(),
            'google_event_id' => $appointment->google_event_id,
            'google_html_link' => $appointment->google_html_link,
            'calendar_error' => $result['calendar_error'],
            'cancelados' => $result['cancelados'],
            'remarcacao' => $result['cancelados'] !== [],
        ];
    }
}
