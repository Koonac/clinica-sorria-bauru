<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappMessage;
use RuntimeException;

/**
 * Envia mensagem automática ao lead (lembrete, follow-up, confirmação) e grava o outbound.
 * Não pausa o agent nem agenda auto-close: é o sistema falando, não um humano.
 */
class SendWhatsappSystemMessage
{
    public function handle(Connection $connection, Lead $lead, string $text, string $kind, ?int $userId = null): WhatsappMessage
    {
        $text = trim($text);
        if ($text === '') {
            throw new RuntimeException('Mensagem vazia.');
        }

        if ($connection->status !== 'connected' || ! filled($connection->session_id) || ! $connection->hasCredentials()) {
            throw new RuntimeException('WhatsApp não está conectado.');
        }

        $to = $this->recipientJid($lead);
        if ($to === null) {
            throw new RuntimeException('Lead sem WhatsApp para envio.');
        }

        $result = (new WhatsappApiClient($connection))->send((string) $connection->session_id, $to, $text);

        $resultTo = is_string($result['to'] ?? null) ? $result['to'] : $to;
        $messageId = isset($result['messageId']) ? (string) $result['messageId'] : null;

        if ($messageId) {
            $existing = WhatsappMessage::query()
                ->where('session_id', $connection->session_id)
                ->where('message_id', $messageId)
                ->first();
            if ($existing) {
                return $existing;
            }
        }

        $raw = $result;
        $raw['system_kind'] = $kind;

        return WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $userId ?? $connection->created_by,
            'session_id' => $connection->session_id,
            'whatsapp_jid' => $resultTo ?: $to,
            'phone_number' => $lead->mobile,
            'contact_name' => $lead->name,
            'direction' => 'outbound',
            'body' => $text,
            'message_id' => $messageId ?: null,
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $lead->id,
            'contact_id' => $lead->contact_id,
            'raw' => $raw,
            'wa_timestamp' => now(),
        ]);
    }

    private function recipientJid(Lead $lead): ?string
    {
        $jid = trim((string) ($lead->whatsapp_jid ?? ''));
        if ($jid !== '') {
            return $jid;
        }

        $digits = preg_replace('/\D+/', '', (string) ($lead->mobile ?? '')) ?: '';

        return $digits !== '' ? $digits.'@c.us' : null;
    }
}
