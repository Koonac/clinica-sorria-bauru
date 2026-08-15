<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;
use App\Models\Crm\Lead;

class ScheduleWhatsappAttendanceAutoClose
{
    /**
     * Agenda fechamento automático após outbound, enquanto a conversa estiver aberta.
     */
    public function handle(Lead $lead, Connection $connection): Lead
    {
        if ($lead->isWhatsappConversationClosed()) {
            return $lead;
        }

        $minutes = max(1, min(1440, (int) ($connection->whatsapp_attendance_auto_close_minutes ?? 10)));

        $lead->forceFill([
            'whatsapp_auto_close_at' => now()->addMinutes($minutes),
        ])->save();

        return $lead->fresh() ?? $lead;
    }

    /**
     * Cancela o prazo (cliente respondeu ou atendimento encerrado).
     */
    public function clear(Lead $lead): Lead
    {
        if ($lead->whatsapp_auto_close_at === null) {
            return $lead;
        }

        $lead->forceFill([
            'whatsapp_auto_close_at' => null,
        ])->save();

        return $lead->fresh() ?? $lead;
    }
}
