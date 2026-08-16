<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Throwable;

class SendWhatsappFinalizeNotice
{
    public function handle(Lead $lead, ?User $user = null): void
    {
        $jid = trim((string) ($lead->whatsapp_jid ?? ''));
        if ($jid === '') {
            return;
        }

        $connection = Connection::withoutGlobalScopes()
            ->where('clinic_id', $lead->clinic_id)
            ->where('status', 'connected')
            ->whereNotNull('session_id')
            ->orderBy('id')
            ->first();

        if (! $connection || ! filled($connection->session_id) || ! $connection->hasCredentials()) {
            return;
        }

        $texto = trim((string) ($connection->whatsapp_finalize_notice ?? ''));
        if ($texto === '') {
            return;
        }

        try {
            $result = (new WhatsappApiClient($connection))->send(
                (string) $connection->session_id,
                $jid,
                $texto,
            );
        } catch (Throwable $e) {
            Log::warning('FinalizeWhatsappConversation: falha ao avisar finalização', [
                'lead_id' => $lead->id,
                'message' => $e->getMessage(),
            ]);

            return;
        }

        $resultTo = is_string($result['to'] ?? null) ? $result['to'] : $jid;
        $messageId = isset($result['messageId']) ? (string) $result['messageId'] : null;

        if ($messageId) {
            $existing = WhatsappMessage::query()
                ->where('session_id', $connection->session_id)
                ->where('message_id', $messageId)
                ->first();
            if ($existing) {
                return;
            }
        }

        WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $user?->id,
            'session_id' => $connection->session_id,
            'whatsapp_jid' => $resultTo ?: $jid,
            'phone_number' => $lead->mobile,
            'contact_name' => $lead->name,
            'direction' => 'outbound',
            'body' => $texto,
            'message_id' => $messageId ?: null,
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $lead->id,
            'contact_id' => $lead->contact_id,
            'raw' => $result,
            'wa_timestamp' => now(),
        ]);
    }
}
