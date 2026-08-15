<?php

namespace App\Services\Crm;

use App\Models\Crm\Lead;

class ResumeWhatsappAgentForLead
{
    /**
     * Retoma o agent no lead (manual ou automática). Zera pausa e prazo de retomada.
     */
    public function handle(Lead $lead): Lead
    {
        $lead->forceFill([
            'whatsapp_agent_paused_at' => null,
            'whatsapp_agent_resume_at' => null,
        ])->save();

        return $lead->fresh(['contact', 'source', 'owner', 'stage']) ?? $lead;
    }
}
