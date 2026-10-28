<?php

namespace App\Services\Crm\Appointments;

use App\Models\Crm\Activity;
use App\Models\Crm\Appointment;
use App\Models\Crm\ClinicService;
use App\Models\Crm\CrmNotification;
use App\Models\Crm\Lead;
use App\Services\Crm\NotifyReception;
use App\Services\Crm\ScheduleWhatsappFollowUp;
use App\Services\Crm\UpdateLeadAttendanceStatus;
use Carbon\Carbon;
use RuntimeException;
use Throwable;

/**
 * Registra a preferência de dia/horário do paciente para a recepção confirmar.
 */
class RegisterPreBooking
{
    public function __construct(
        private CancelAppointment $cancelAppointment,
        private UpdateLeadAttendanceStatus $attendanceStatus,
        private ScheduleWhatsappFollowUp $followUp,
        private NotifyReception $notifyReception,
    ) {}

    /**
     * @param  array{preferred_text: string, preferred_start_at?: string|null, clinic_service_id?: int|null, notes?: string|null}  $data
     */
    public function handle(Lead $lead, array $data, ?int $userId = null, string $source = Appointment::SOURCE_AI): Appointment
    {
        $preferredText = trim((string) ($data['preferred_text'] ?? ''));
        if ($preferredText === '') {
            throw new RuntimeException('preferencia é obrigatória.');
        }

        $preferredStart = null;
        if (filled($data['preferred_start_at'] ?? null)) {
            try {
                $preferredStart = Carbon::parse((string) $data['preferred_start_at'], config('app.timezone'));
            } catch (Throwable) {
                throw new RuntimeException('data_hora_preferida inválida. Use ISO-8601.');
            }
        }

        $service = null;
        if (filled($data['clinic_service_id'] ?? null)) {
            $service = ClinicService::query()->find((int) $data['clinic_service_id']);
        }

        // Um pré-agendamento pendente por lead: o novo substitui o anterior.
        Appointment::query()
            ->where('lead_id', $lead->id)
            ->where('status', Appointment::STATUS_PRE_BOOKED)
            ->get()
            ->each(fn (Appointment $old) => $this->cancelAppointment->handle(
                $old,
                'Substituído por nova preferência do paciente.',
                $userId,
                $source,
            ));

        $notes = trim((string) ($data['notes'] ?? ''));

        $appointment = Appointment::create([
            'lead_id' => $lead->id,
            'contact_id' => $lead->contact_id,
            'clinic_service_id' => $service?->id,
            'status' => Appointment::STATUS_PRE_BOOKED,
            'source' => $source,
            'title' => $service?->name,
            'preferred_text' => mb_substr($preferredText, 0, 500),
            'preferred_start_at' => $preferredStart,
            'notes' => $notes !== '' ? $notes : null,
            'created_by' => $userId,
        ]);

        Activity::create([
            'type' => 'task',
            'subject' => 'Pré-agendamento: '.$preferredText,
            'body' => $notes !== '' ? $notes : null,
            'due_at' => $preferredStart,
            'lead_id' => $lead->id,
            'user_id' => $userId,
            'meta' => [
                'appointment_id' => $appointment->id,
                'clinic_service_id' => $service?->id,
                'source' => $source,
            ],
        ]);

        $this->attendanceStatus->handle($lead, Lead::ATTENDANCE_PRE_BOOKED, 'pre_booking', null, $userId);
        $this->followUp->clear($lead);

        $body = 'Preferência: '.$preferredText;
        if ($service) {
            $body .= "\nProcedimento: ".$service->name;
        }
        if ($notes !== '') {
            $body .= "\nObs.: ".$notes;
        }

        $this->notifyReception->handle(
            (int) $lead->clinic_id,
            CrmNotification::TYPE_PRE_BOOKING,
            'Novo pré-agendamento: '.($lead->name ?: 'paciente'),
            $body,
            $lead,
            $appointment,
        );

        return $appointment->fresh(['service', 'lead']) ?? $appointment;
    }
}
