<?php

namespace App\Services\Crm;

use App\Models\Crm\Activity;
use App\Models\Crm\Lead;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class FinalizeWhatsappConversationForLead
{
    public function __construct(private ResumeWhatsappAgentForLead $resumer) {}

    /**
     * Finaliza o atendimento humano: remove o dono, reativa o agent e registra quem finalizou.
     */
    public function handle(Lead $lead, User $user): Lead
    {
        return DB::transaction(function () use ($lead, $user) {
            $lead->forceFill([
                'owner_id' => null,
            ])->save();

            $updated = $this->resumer->handle($lead->fresh() ?? $lead);

            Activity::create([
                'type' => 'note',
                'subject' => 'Conversa finalizada',
                'body' => sprintf('Conversa finalizada por %s. Atendimento devolvido ao Agent IA.', $user->name),
                'lead_id' => $updated->id,
                'contact_id' => $updated->contact_id,
                'user_id' => $user->id,
                'meta' => [
                    'whatsapp_finalized' => true,
                    'finalized_by' => $user->id,
                    'finalized_by_name' => $user->name,
                ],
            ]);

            return $updated->fresh(['contact', 'source', 'owner', 'stage']) ?? $updated;
        });
    }
}
