<?php

namespace App\Services\Crm\Appointments;

use App\Models\Crm\Activity;
use App\Models\Crm\Appointment;
use App\Models\Crm\CrmNotification;
use App\Services\Crm\NotifyReception;
use RuntimeException;

/**
 * Paciente confirmou presença (resposta ao lembrete) ou a recepção marcou como confirmada.
 */
class MarkAppointmentConfirmed
{
    public function __construct(private NotifyReception $notifyReception) {}

    public function handle(Appointment $appointment, ?int $userId = null, string $source = Appointment::SOURCE_MANUAL): Appointment
    {
        if ($appointment->status === Appointment::STATUS_CONFIRMED) {
            return $appointment;
        }
        if ($appointment->status !== Appointment::STATUS_SCHEDULED) {
            throw new RuntimeException('Só consultas agendadas podem ser confirmadas.');
        }

        $appointment->forceFill([
            'status' => Appointment::STATUS_CONFIRMED,
            'confirmed_at' => now(),
        ])->save();

        $lead = $appointment->lead()->first();
        if ($lead) {
            Activity::create([
                'type' => 'task',
                'subject' => 'Presença confirmada'.($appointment->title ? ': '.$appointment->title : ''),
                'lead_id' => $lead->id,
                'user_id' => $userId,
                'meta' => [
                    'appointment_id' => $appointment->id,
                    'source' => $source,
                ],
            ]);

            if ($source === Appointment::SOURCE_AI) {
                $when = $appointment->starts_at?->timezone(config('app.timezone'))->format('d/m \à\s H:i');
                $this->notifyReception->handle(
                    (int) $appointment->clinic_id,
                    CrmNotification::TYPE_APPOINTMENT_CONFIRMED,
                    'Paciente confirmou presença'.($when ? ' ('.$when.')' : ''),
                    null,
                    $lead,
                    $appointment,
                );
            }
        }

        return $appointment;
    }
}
