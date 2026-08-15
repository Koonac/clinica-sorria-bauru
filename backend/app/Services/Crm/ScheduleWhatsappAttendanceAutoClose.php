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
        $closesAt = now()->addMinutes($minutes);

        // Update direto evita falha silenciosa por global scope / instância stale no queue worker.
        Lead::withoutGlobalScopes()
            ->whereKey($lead->id)
            ->whereNull('whatsapp_conversation_closed_at')
            ->update([
                'whatsapp_auto_close_at' => $closesAt,
                'updated_at' => now(),
            ]);

        $lead->whatsapp_auto_close_at = $closesAt;

        return $lead;
    }

    /**
     * Cancela o prazo (cliente respondeu ou atendimento encerrado).
     */
    public function clear(Lead $lead): Lead
    {
        if ($lead->whatsapp_auto_close_at === null) {
            return $lead;
        }

        Lead::withoutGlobalScopes()
            ->whereKey($lead->id)
            ->update([
                'whatsapp_auto_close_at' => null,
                'updated_at' => now(),
            ]);

        $lead->whatsapp_auto_close_at = null;

        return $lead;
    }
}
