<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use Carbon\CarbonInterface;

class PauseWhatsappAgentWithAutoResumeForLead
{
    /**
     * Pausa o agent e agenda retomada automática com base nas horas da conexão.
     * Renova o prazo se já estiver pausado.
     *
     * @return array{hours: int, resume_at: CarbonInterface, was_paused: bool}
     */
    public function handle(Lead $lead, Connection $connection): array
    {
        $hours = max(1, min(168, (int) ($connection->whatsapp_agent_auto_resume_hours ?? 24)));
        $resumeAt = now()->addHours($hours);
        $wasPaused = $lead->whatsapp_agent_paused_at !== null;

        $lead->forceFill([
            'whatsapp_agent_paused_at' => $lead->whatsapp_agent_paused_at ?? now(),
            'whatsapp_agent_resume_at' => $resumeAt,
        ])->save();

        return [
            'hours' => $hours,
            'resume_at' => $resumeAt,
            'was_paused' => $wasPaused,
        ];
    }
}
