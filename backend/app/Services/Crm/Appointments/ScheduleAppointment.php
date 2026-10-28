<?php

namespace App\Services\Crm\Appointments;

use App\Models\Crm\Activity;
use App\Models\Crm\Appointment;
use App\Models\Crm\Lead;
use App\Models\Crm\Task;
use App\Services\Crm\GoogleCalendarClient;
use App\Services\Crm\ScheduleWhatsappFollowUp;
use App\Services\Crm\UpdateLeadAttendanceStatus;
use Carbon\Carbon;
use RuntimeException;
use Throwable;

/**
 * Marca (ou remarca) uma consulta: Appointment + Task no CRM + evento no Google Calendar.
 * Usado pelo agent (modo direto), pela recepção ao confirmar pré-agendamento e no cadastro manual.
 */
class ScheduleAppointment
{
    public function __construct(
        private GoogleCalendarClient $calendar,
        private CancelAppointment $cancelAppointment,
        private UpdateLeadAttendanceStatus $attendanceStatus,
        private ScheduleWhatsappFollowUp $followUp,
    ) {}

    /**
     * @param  array{title: string, starts_at: string|\DateTimeInterface, ends_at: string|\DateTimeInterface, notes?: string|null, clinic_service_id?: int|null, origin_label?: string|null}  $data
     * @param  bool  $replacePrevious  cancela consultas futuras anteriores do lead (remarcação)
     * @return array{appointment: Appointment, task: Task, calendar_error: ?string, cancelados: list<array{task_id: ?int, google_event_id: ?string, titulo: string}>}
     */
    public function handle(
        Lead $lead,
        array $data,
        ?int $userId,
        string $source,
        ?Appointment $from = null,
        bool $replacePrevious = false,
        array $activityMeta = [],
    ): array {
        $title = trim((string) ($data['title'] ?? ''));
        if ($title === '') {
            throw new RuntimeException('titulo é obrigatório.');
        }

        try {
            $startsAt = Carbon::parse($data['starts_at'], config('app.timezone'));
            $endsAt = Carbon::parse($data['ends_at'], config('app.timezone'));
        } catch (Throwable) {
            throw new RuntimeException('inicio/fim inválidos. Use ISO-8601.');
        }

        if ($endsAt->lessThanOrEqualTo($startsAt)) {
            throw new RuntimeException('fim deve ser posterior a inicio.');
        }
        if ($startsAt->lessThan(now()->subMinutes(5))) {
            throw new RuntimeException('Não agende no passado.');
        }

        $notes = trim((string) ($data['notes'] ?? ''));

        $cancelados = $replacePrevious ? $this->cancelPrevious($lead, $from, $userId, $source) : [];

        // Só lead_id: o CHECK de tasks exige lead XOR deal.
        $task = Task::create([
            'title' => $title,
            'description' => $notes !== '' ? $notes : null,
            'due_at' => $startsAt,
            'lead_id' => $lead->id,
            'user_id' => $userId,
        ]);

        $calendarResult = null;
        $calendarError = null;
        try {
            $calendarResult = $this->calendar->createEvent([
                'summary' => $title,
                'description' => $this->calendarDescription($lead, $notes, $data['origin_label'] ?? null),
                'start' => $startsAt->toIso8601String(),
                'end' => $endsAt->toIso8601String(),
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

        $attrs = [
            'lead_id' => $lead->id,
            'contact_id' => $lead->contact_id,
            'status' => Appointment::STATUS_SCHEDULED,
            'title' => $title,
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
            'task_id' => $task->id,
            'google_event_id' => $calendarResult['id'] ?? null,
            'google_html_link' => $calendarResult['htmlLink'] ?? null,
            'reminder_sent_at' => null,
            'confirmed_at' => null,
        ];
        if (array_key_exists('clinic_service_id', $data)) {
            $attrs['clinic_service_id'] = $data['clinic_service_id'];
        }
        if ($notes !== '') {
            $attrs['notes'] = $notes;
        }

        if ($from) {
            $from->forceFill($attrs + ['confirmed_by' => $userId])->save();
            $appointment = $from;
        } else {
            $appointment = Appointment::create($attrs + [
                'source' => $source,
                'created_by' => $userId,
            ]);
        }

        Activity::create([
            'type' => 'task',
            // Prefixo do agent mantido: o histórico antigo de remarcação busca por ele.
            'subject' => ($source === Appointment::SOURCE_AI ? 'Agendamento criado pelo agent: ' : 'Consulta agendada: ').$title,
            'body' => $notes !== '' ? $notes : null,
            'due_at' => $startsAt,
            'lead_id' => $lead->id,
            'user_id' => $userId,
            'meta' => array_merge([
                'appointment_id' => $appointment->id,
                'task_id' => $task->id,
                'google_event_id' => $calendarResult['id'] ?? null,
                'google_html_link' => $calendarResult['htmlLink'] ?? null,
                'calendar_error' => $calendarError,
                'replaced_task_ids' => array_values(array_filter(array_column($cancelados, 'task_id'))),
                'replaced_event_ids' => array_values(array_filter(array_column($cancelados, 'google_event_id'))),
            ], $activityMeta),
        ]);

        $this->attendanceStatus->handle($lead, Lead::ATTENDANCE_SCHEDULED, 'appointment_scheduled', null, $userId);
        $this->followUp->clear($lead);

        return [
            'appointment' => $appointment->fresh(['service', 'lead']) ?? $appointment,
            'task' => $task,
            'calendar_error' => $calendarError,
            'cancelados' => $cancelados,
        ];
    }

    /**
     * Cancela consultas futuras do lead (e Tasks antigas do agent, anteriores à tabela appointments).
     *
     * @return list<array{task_id: ?int, google_event_id: ?string, titulo: string}>
     */
    private function cancelPrevious(Lead $lead, ?Appointment $from, ?int $userId, string $source): array
    {
        $cancelados = [];

        $previous = Appointment::query()
            ->where('lead_id', $lead->id)
            ->whereIn('status', [Appointment::STATUS_SCHEDULED, Appointment::STATUS_CONFIRMED])
            ->where('starts_at', '>=', now()->startOfDay())
            ->when($from, fn ($q) => $q->whereKeyNot($from->id))
            ->get();

        foreach ($previous as $appointment) {
            $this->cancelAppointment->handle($appointment, 'Remarcado para um novo horário.', $userId, $source);
            $cancelados[] = [
                'task_id' => $appointment->task_id,
                'google_event_id' => $appointment->google_event_id,
                'titulo' => (string) $appointment->title,
            ];
        }

        return array_merge($cancelados, $this->cancelLegacyAgentTasks($lead, $userId));
    }

    /**
     * @return list<array{task_id: ?int, google_event_id: ?string, titulo: string}>
     */
    private function cancelLegacyAgentTasks(Lead $lead, ?int $userId): array
    {
        $activities = Activity::query()
            ->where('lead_id', $lead->id)
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
            if ($taskId <= 0 || isset($seenTasks[$taskId]) || isset($meta['appointment_id'])) {
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
                'lead_id' => $lead->id,
                'user_id' => $userId,
                'meta' => [
                    'task_id' => $task->id,
                    'google_event_id' => $eventId,
                    'calendar_delete_error' => $calendarDeleteError,
                    'agent_id' => $meta['agent_id'] ?? null,
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

    private function calendarDescription(Lead $lead, string $notes, ?string $originLabel): string
    {
        $parts = [];
        if ($notes !== '') {
            $parts[] = $notes;
        }
        $parts[] = 'Lead: '.$lead->name.' (#'.$lead->id.')';
        if ($lead->mobile) {
            $parts[] = 'Telefone: '.$lead->mobile;
        }
        if (filled($originLabel)) {
            $parts[] = (string) $originLabel;
        }

        return implode("\n", $parts);
    }
}
