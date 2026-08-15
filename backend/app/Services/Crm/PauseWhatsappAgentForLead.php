<?php

namespace App\Services\Crm;

use App\Models\Crm\Activity;
use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use App\Models\User;

class PauseWhatsappAgentForLead
{
    public function __construct(private PauseWhatsappAgentWithAutoResumeForLead $pauseWithResume) {}

    /**
     * Pausa o agent no lead por resposta humana (plataforma ou celular).
     * Agenda retomada automática com base em whatsapp_agent_auto_resume_hours da conexão.
     * Renova resume_at em mensagens humanas subsequentes; Activity só na primeira pausa.
     *
     * @param  'platform'|'phone'  $source
     */
    public function handle(Lead $lead, User $user, string $source, Connection $connection, ?string $body = null): bool
    {
        $result = $this->pauseWithResume->handle($lead, $connection, $user->id, 'human_reply');

        if ($result['was_paused']) {
            return false;
        }

        $labels = [
            'platform' => 'Agent pausado: resposta humana (plataforma)',
            'phone' => 'Agent pausado: resposta humana (celular)',
        ];

        Activity::create([
            'type' => 'note',
            'subject' => $labels[$source] ?? 'Agent pausado: resposta humana',
            'body' => $body,
            'lead_id' => $lead->id,
            'user_id' => $user->id,
            'meta' => [
                'handoff' => true,
                'source' => $source,
                'resume_at' => $result['resume_at']->toIso8601String(),
                'auto_resume_hours' => $result['hours'],
            ],
        ]);

        return true;
    }
}
