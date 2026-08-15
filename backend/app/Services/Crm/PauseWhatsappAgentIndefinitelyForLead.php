<?php

namespace App\Services\Crm;

use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappAttendanceSegment;

class PauseWhatsappAgentIndefinitelyForLead
{
    public function __construct(private TrackWhatsappAttendanceSegment $attendance) {}

    /**
     * Pausa o agent até retomada manual (clique ou escalação). Sem resume_at.
     */
    public function handle(Lead $lead, ?int $actorUserId = null, string $source = 'pause'): Lead
    {
        $wasPaused = $lead->whatsapp_agent_paused_at !== null;

        $lead->forceFill([
            'whatsapp_agent_paused_at' => $lead->whatsapp_agent_paused_at ?? now(),
            'whatsapp_agent_resume_at' => null,
        ])->save();

        if (! $wasPaused) {
            $this->attendance->handle(
                $lead->fresh() ?? $lead,
                WhatsappAttendanceSegment::MODE_HUMAN,
                $lead->owner_id ?? $actorUserId,
                $source,
            );
        }

        return $lead->fresh(['contact', 'source', 'owner', 'stage']) ?? $lead;
    }
}
