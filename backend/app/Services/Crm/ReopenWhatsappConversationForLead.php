<?php

namespace App\Services\Crm;

use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappAttendanceSegment;

class ReopenWhatsappConversationForLead
{
    public function __construct(private TrackWhatsappAttendanceSegment $attendance) {}

    /**
     * Reabre conversa fechada: limpa closed_* e inicia segmento AI.
     * No-op se a conversa já estiver aberta.
     */
    public function handle(Lead $lead, string $source = 'reopen'): Lead
    {
        if (! $lead->isWhatsappConversationClosed()) {
            return $lead;
        }

        $lead->forceFill([
            'whatsapp_conversation_closed_at' => null,
            'whatsapp_conversation_closed_by' => null,
            'whatsapp_auto_close_at' => null,
            'whatsapp_agent_paused_at' => null,
            'whatsapp_agent_resume_at' => null,
        ])->save();

        $fresh = $lead->fresh(['contact', 'source', 'owner', 'stage']) ?? $lead;

        $this->attendance->handle(
            $fresh,
            WhatsappAttendanceSegment::MODE_AI,
            null,
            $source,
        );

        return $fresh;
    }
}
