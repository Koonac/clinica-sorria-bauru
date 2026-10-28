<?php

namespace App\Services\Crm\Appointments;

use App\Models\Crm\Appointment;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/**
 * Recepção transforma o pré-agendamento em consulta marcada (Google Calendar + Task).
 */
class ConfirmPreBooking
{
    public function __construct(
        private ScheduleAppointment $schedule,
        private SendAppointmentScheduledNotice $notice,
    ) {}

    /**
     * @param  array{starts_at: string, ends_at: string, title?: string|null, notes?: string|null, clinic_service_id?: int|null, notify_patient?: bool}  $data
     * @return array{appointment: Appointment, calendar_error: ?string, patient_notified: bool, notify_error: ?string}
     */
    public function handle(Appointment $appointment, array $data, User $user): array
    {
        if ($appointment->status !== Appointment::STATUS_PRE_BOOKED) {
            throw ValidationException::withMessages([
                'appointment' => 'Este pré-agendamento já foi tratado.',
            ]);
        }

        $lead = $appointment->lead()->firstOrFail();

        $payload = [
            'title' => trim((string) ($data['title'] ?? '')) ?: ($appointment->title ?: 'Consulta'),
            'starts_at' => $data['starts_at'],
            'ends_at' => $data['ends_at'],
            'notes' => $data['notes'] ?? $appointment->notes,
            'origin_label' => 'Pré-agendamento confirmado por '.$user->name,
        ];
        if (array_key_exists('clinic_service_id', $data)) {
            $payload['clinic_service_id'] = $data['clinic_service_id'];
        }

        $result = $this->schedule->handle($lead, $payload, $user->id, Appointment::SOURCE_MANUAL, $appointment);

        $notified = ['sent' => false, 'error' => null];
        if (! empty($data['notify_patient'])) {
            $notified = $this->notice->handle($result['appointment'], $user->id);
        }

        return [
            'appointment' => $result['appointment'],
            'calendar_error' => $result['calendar_error'],
            'patient_notified' => $notified['sent'],
            'notify_error' => $notified['error'],
        ];
    }
}
