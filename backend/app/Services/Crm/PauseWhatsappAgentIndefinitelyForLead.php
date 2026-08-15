<?php

namespace App\Services\Crm;

use App\Models\Crm\Lead;

class PauseWhatsappAgentIndefinitelyForLead
{
    /**
     * Pausa o agent até retomada manual (clique ou escalação). Sem resume_at.
     */
    public function handle(Lead $lead): Lead
    {
        $lead->forceFill([
            'whatsapp_agent_paused_at' => $lead->whatsapp_agent_paused_at ?? now(),
            'whatsapp_agent_resume_at' => null,
        ])->save();

        return $lead->fresh(['contact', 'source', 'owner', 'stage']) ?? $lead;
    }
}
