<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;
use App\Models\Crm\WhatsappConversationRead;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use App\Support\ClinicContext;

class MarkWhatsappChatRead
{
    public function __construct(
        private WhatsappChatHistory $history,
        private WhatsappConversationKey $conversationKey,
        private ClinicContext $clinicContext,
    ) {}

    /**
     * @return array{conversation_key: string, last_read_message_id: int|null, unread_count: int}
     */
    public function handle(Connection $connection, User $user, string $jid, ?int $leadId = null): array
    {
        $jid = trim($jid);
        $relatedJids = $jid !== '' ? $this->history->relatedJids($connection->id, $jid) : [];

        $latest = WhatsappMessage::query()
            ->where('connection_id', $connection->id)
            ->where(function ($q) use ($leadId, $jid, $relatedJids) {
                if ($leadId) {
                    $q->orWhere('lead_id', $leadId);
                }
                if ($jid !== '') {
                    $q->orWhere(function ($inner) use ($relatedJids) {
                        $inner->whereIn('whatsapp_jid', $relatedJids)
                            ->orWhereIn('whatsapp_lid', $relatedJids);
                    });
                }
            })
            ->orderByDesc('id')
            ->first();

        if (! $latest) {
            return [
                'conversation_key' => $jid,
                'last_read_message_id' => null,
                'unread_count' => 0,
            ];
        }

        $key = $this->conversationKey->fromMessageFields(
            $latest->phone_number,
            $latest->whatsapp_jid,
            $latest->whatsapp_lid,
        );

        $read = WhatsappConversationRead::query()->updateOrCreate(
            [
                'connection_id' => $connection->id,
                'user_id' => $user->id,
                'conversation_key' => $key,
            ],
            [
                'clinic_id' => $connection->clinic_id ?? $this->clinicContext->id(),
                'last_read_message_id' => $latest->id,
                'last_read_at' => now(),
            ],
        );

        return [
            'conversation_key' => $key,
            'last_read_message_id' => $read->last_read_message_id,
            'unread_count' => 0,
        ];
    }
}
