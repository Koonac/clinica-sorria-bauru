<?php

namespace App\Services\Crm;

use App\Models\Crm\Activity;
use App\Models\Crm\Lead;
use App\Models\User;

class PauseWhatsappAgentForLead
{
    /**
     * Pausa o agent no lead por resposta humana (plataforma ou celular).
     * Idempotente: se já estiver pausado, não grava Activity de novo.
     *
     * @param  'platform'|'phone'  $source
     */
    public function handle(Lead $lead, User $user, string $source, ?string $body = null): bool
    {
        if ($lead->whatsapp_agent_paused_at !== null) {
            return false;
        }

        $lead->forceFill([
            'whatsapp_agent_paused_at' => now(),
        ])->save();

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
            ],
        ]);

        return true;
    }
}
