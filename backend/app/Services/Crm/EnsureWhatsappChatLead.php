<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use App\Models\User;

class EnsureWhatsappChatLead
{
    public function __construct(
        private WhatsappLeadResolver $leadResolver,
    ) {}

    /**
     * Garante um lead aberto para o chat WhatsApp (cria se contact/deal existir sem lead).
     *
     * @param  array{jid: string, phone_number?: string|null, contact_name?: string|null}  $payload
     * @return array{
     *     lead_id: int,
     *     contact_id: int|null,
     *     deal_id: int|null,
     *     owner_id: int|null,
     *     owner_name: string|null,
     *     contact_name: string|null,
     *     whatsapp_jid: string|null,
     *     whatsapp_agent_paused_at: string|null,
     *     whatsapp_agent_resume_at: string|null,
     *     whatsapp_conversation_closed_at: string|null
     * }
     */
    public function handle(Connection $connection, array $payload, ?User $owner = null): array
    {
        $resolved = $this->leadResolver->resolve($connection, [
            'jid' => $payload['jid'] ?? null,
            'phone_number' => $payload['phone_number'] ?? null,
            'contact_name' => $payload['contact_name'] ?? null,
        ], $owner);

        /** @var Lead|null $lead */
        $lead = $resolved['lead'];
        if (! $lead) {
            throw new \RuntimeException('Não foi possível vincular um lead a esta conversa.');
        }

        $lead->loadMissing('owner:id,name');

        return [
            'lead_id' => (int) $lead->id,
            'contact_id' => $resolved['contact']?->id ? (int) $resolved['contact']->id : ($lead->contact_id ? (int) $lead->contact_id : null),
            'deal_id' => $resolved['deal']?->id ? (int) $resolved['deal']->id : null,
            'owner_id' => $lead->owner_id ? (int) $lead->owner_id : null,
            'owner_name' => $lead->owner?->name,
            'contact_name' => $lead->name ?: ($resolved['contact']?->name),
            'whatsapp_jid' => $lead->whatsapp_jid,
            'whatsapp_agent_paused_at' => $lead->whatsapp_agent_paused_at?->toIso8601String(),
            'whatsapp_agent_resume_at' => $lead->whatsapp_agent_resume_at?->toIso8601String(),
            'whatsapp_conversation_closed_at' => $lead->whatsapp_conversation_closed_at?->toIso8601String(),
        ];
    }
}
