<?php

namespace App\Services\Crm;

use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappAttendanceSegment;

class ResumeWhatsappAgentForLead
{
    public function __construct(private TrackWhatsappAttendanceSegment $attendance) {}

    /**
     * Retoma o agent no lead (manual ou automática). Zera pausa e prazo de retomada.
     */
    public function handle(Lead $lead, string $source = 'resume'): Lead
    {
        $lead->forceFill([
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
