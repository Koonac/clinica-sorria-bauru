<?php

namespace App\Services\Crm;

use App\Jobs\Crm\SendReceptionWhatsappAlertJob;
use App\Models\Crm\Appointment;
use App\Models\Crm\CrmNotification;
use App\Models\Crm\Lead;

/**
 * Cria aviso no sino do painel e, se configurado, alerta o WhatsApp da recepção.
 */
class NotifyReception
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function handle(
        int $clinicId,
        string $type,
        string $title,
        ?string $body = null,
        ?Lead $lead = null,
        ?Appointment $appointment = null,
        string $priority = CrmNotification::PRIORITY_NORMAL,
        array $data = [],
    ): CrmNotification {
        $notification = CrmNotification::create([
            'clinic_id' => $clinicId,
            'type' => $type,
            'priority' => $priority === CrmNotification::PRIORITY_URGENT
                ? CrmNotification::PRIORITY_URGENT
                : CrmNotification::PRIORITY_NORMAL,
            'title' => mb_substr($title, 0, 190),
            'body' => $body,
            'lead_id' => $lead?->id,
            'appointment_id' => $appointment?->id,
            'data' => $data !== [] ? $data : null,
        ]);

        SendReceptionWhatsappAlertJob::dispatch($notification->id)->afterCommit();

        return $notification;
    }
}
