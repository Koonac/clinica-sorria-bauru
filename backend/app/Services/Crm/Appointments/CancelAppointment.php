<?php

namespace App\Services\Crm\Appointments;

use App\Models\Crm\Activity;
use App\Models\Crm\Appointment;
use App\Models\Crm\CrmNotification;
use App\Models\Crm\Lead;
use App\Models\Crm\Task;
use App\Services\Crm\GoogleCalendarClient;
use App\Services\Crm\NotifyReception;
use App\Services\Crm\UpdateLeadAttendanceStatus;
use Throwable;

class CancelAppointment
{
    public function __construct(
        private GoogleCalendarClient $calendar,
        private UpdateLeadAttendanceStatus $attendanceStatus,
        private NotifyReception $notifyReception,
    ) {}

    /**
     * Cancela consulta/pré-agendamento: remove evento do Google, conclui a Task e volta o lead
     * para "em atendimento" se não sobrar outra consulta em aberto.
     *
     * @param  bool  $notify  avisa a recepção (cancelamento pedido pelo paciente)
     */
    public function handle(
        Appointment $appointment,
        ?string $reason = null,
        ?int $userId = null,
        string $source = Appointment::SOURCE_MANUAL,
        bool $notify = false,
    ): Appointment {
        if (! in_array($appointment->status, Appointment::ACTIVE_STATUSES, true)) {
            return $appointment;
        }

        $calendarError = null;
        if (filled($appointment->google_event_id)) {
            try {
                $this->calendar->deleteEvent((string) $appointment->google_event_id);
            } catch (Throwable $e) {
                $calendarError = $e->getMessage();
            }
        }

        if ($appointment->task_id) {
            $task = Task::query()->find($appointment->task_id);
            if ($task && ! $task->isDone()) {
                $task->forceFill([
                    'done_at' => now(),
                    'description' => trim((string) ($task->description ?? '')."\n\n[Consulta cancelada".($reason ? ': '.$reason : '').']'),
                ])->save();
            }
        }

        $wasPreBooking = $appointment->status === Appointment::STATUS_PRE_BOOKED;

        $appointment->forceFill([
            'status' => Appointment::STATUS_CANCELLED,
            'cancelled_at' => now(),
            'cancel_reason' => $reason !== null ? mb_substr($reason, 0, 500) : null,
        ])->save();

        $lead = $appointment->lead()->first();
        if ($lead) {
            Activity::create([
                'type' => 'task',
                'subject' => ($wasPreBooking ? 'Pré-agendamento cancelado' : 'Consulta cancelada')
                    .($appointment->title ? ': '.$appointment->title : ''),
                'body' => $reason,
                'lead_id' => $lead->id,
                'user_id' => $userId,
                'meta' => [
                    'appointment_id' => $appointment->id,
                    'task_id' => $appointment->task_id,
                    'google_event_id' => $appointment->google_event_id,
                    'calendar_delete_error' => $calendarError,
                    'source' => $source,
                ],
            ]);

            $this->syncLeadStatus($lead);

            if ($notify) {
                $when = $appointment->starts_at
                    ? $appointment->starts_at->timezone(config('app.timezone'))->format('d/m \à\s H:i')
                    : ($appointment->preferred_text ?: 'sem data');
                $this->notifyReception->handle(
                    (int) $appointment->clinic_id,
                    CrmNotification::TYPE_APPOINTMENT_CANCELLED,
                    'Paciente cancelou a consulta ('.$when.')',
                    $reason,
                    $lead,
                    $appointment,
                );
            }
        }

        return $appointment;
    }

    private function syncLeadStatus(Lead $lead): void
    {
        $remaining = $lead->appointments()->active()->get(['id', 'status']);

        if ($remaining->contains(fn (Appointment $a) => $a->status !== Appointment::STATUS_PRE_BOOKED)) {
            return;
        }

        $this->attendanceStatus->handle(
            $lead,
            $remaining->isNotEmpty() ? Lead::ATTENDANCE_PRE_BOOKED : Lead::ATTENDANCE_IN_PROGRESS,
            'appointment_cancelled',
            [Lead::ATTENDANCE_SCHEDULED, Lead::ATTENDANCE_PRE_BOOKED],
        );
    }
}
