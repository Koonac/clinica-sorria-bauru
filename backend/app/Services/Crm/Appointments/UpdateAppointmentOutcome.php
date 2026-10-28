<?php

namespace App\Services\Crm\Appointments;

use App\Models\Crm\Activity;
use App\Models\Crm\Appointment;
use App\Models\Crm\Lead;
use App\Models\Crm\Task;
use App\Services\Crm\UpdateLeadAttendanceStatus;
use Illuminate\Validation\ValidationException;

/**
 * Recepção registra o desfecho: paciente compareceu (realizado) ou faltou.
 */
class UpdateAppointmentOutcome
{
    public const OUTCOMES = [Appointment::STATUS_DONE, Appointment::STATUS_NO_SHOW];

    public function __construct(private UpdateLeadAttendanceStatus $attendanceStatus) {}

    public function handle(Appointment $appointment, string $outcome, ?int $userId = null): Appointment
    {
        if (! in_array($appointment->status, [Appointment::STATUS_SCHEDULED, Appointment::STATUS_CONFIRMED, ...self::OUTCOMES], true)) {
            throw ValidationException::withMessages([
                'outcome' => 'Só consultas agendadas podem receber desfecho.',
            ]);
        }

        $appointment->forceFill(['status' => $outcome])->save();

        if ($appointment->task_id) {
            Task::query()->whereKey($appointment->task_id)->whereNull('done_at')->update(['done_at' => now()]);
        }

        $lead = $appointment->lead()->first();
        if ($lead) {
            Activity::create([
                'type' => 'task',
                'subject' => ($outcome === Appointment::STATUS_DONE ? 'Paciente compareceu' : 'Paciente faltou')
                    .($appointment->title ? ': '.$appointment->title : ''),
                'lead_id' => $lead->id,
                'user_id' => $userId,
                'meta' => ['appointment_id' => $appointment->id, 'outcome' => $outcome],
            ]);

            $hasOtherScheduled = $lead->appointments()
                ->whereIn('status', [Appointment::STATUS_SCHEDULED, Appointment::STATUS_CONFIRMED])
                ->whereKeyNot($appointment->id)
                ->exists();
            if (! $hasOtherScheduled) {
                $this->attendanceStatus->handle($lead, Lead::ATTENDANCE_IN_PROGRESS, 'appointment_'.$outcome, [Lead::ATTENDANCE_SCHEDULED]);
            }
        }

        return $appointment;
    }
}
