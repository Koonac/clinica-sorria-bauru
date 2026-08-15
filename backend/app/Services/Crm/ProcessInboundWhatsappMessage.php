<?php

namespace App\Services\Crm;

use App\Models\Clinic;
use App\Models\Crm\Connection;
use App\Models\Crm\WhatsappMessage;
use App\Support\ClinicContext;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;

class ProcessInboundWhatsappMessage
{
    public function __construct(
        private WhatsappLeadResolver $leadResolver,
        private ClinicContext $clinicContext,
    ) {}

    /**
     * Persiste mensagem de webhook já filtrada (chat direto).
     * Retorna null se for duplicata ou se falhar constraint unique.
     *
     * @param  array<string, mixed>  $payload
     */
    public function handle(Connection $connection, string $sessionId, array $payload): ?WhatsappMessage
    {
        $clinic = $connection->relationLoaded('clinic')
            ? $connection->clinic
            : Clinic::query()->find($connection->clinic_id);

        if ($clinic) {
            $this->clinicContext->set($clinic);
        }

        $jid = trim((string) ($payload['jid'] ?? ''));
        if ($jid === '') {
            return null;
        }

        $direction = ! empty($payload['from_me']) ? 'outbound' : 'inbound';

        $messageId = $this->extractMessageId($payload);
        $body = array_key_exists('body', $payload)
            ? (isset($payload['body']) ? (string) $payload['body'] : null)
            : null;

        $waTs = null;
        if (isset($payload['timestamp']) && is_numeric($payload['timestamp'])) {
            $waTs = Carbon::createFromTimestampUTC((int) $payload['timestamp'])
                ->timezone(config('app.timezone'));
        }

        if ($messageId) {
            $exists = WhatsappMessage::query()
                ->where('session_id', $sessionId)
                ->where('message_id', $messageId)
                ->exists();
            if ($exists) {
                return null;
            }
        }

        if ($direction === 'outbound' || ! $messageId) {
            $soft = $this->findSoftDuplicate($sessionId, $jid, $payload, $body, $waTs, $direction);
            if ($soft) {
                if ($direction === 'outbound' && $messageId && ! $soft->message_id) {
                    $soft->forceFill(['message_id' => $messageId])->save();
                }

                return null;
            }
        }

        $resolved = $this->leadResolver->resolve($connection, [
            'jid' => $jid,
            'phone_number' => $payload['phone_number'] ?? null,
            'contact_name' => $payload['contact_name'] ?? null,
        ]);

        $media = $payload['media'] ?? null;
        if (is_array($media) && isset($media['data']) && is_string($media['data']) && strlen($media['data']) > 200_000) {
            $media = [
                'mimetype' => $media['mimetype'] ?? null,
                'filename' => $media['filename'] ?? null,
                'filesize' => $media['filesize'] ?? null,
                'omitted' => true,
            ];
        }

        $raw = $payload;
        unset($raw['message'], $raw['media']);

        try {
            return WhatsappMessage::create([
                'clinic_id' => $connection->clinic_id,
                'connection_id' => $connection->id,
                'user_id' => $connection->created_by,
                'session_id' => $sessionId,
                'whatsapp_jid' => $jid,
                'whatsapp_lid' => filled($payload['lid'] ?? null) ? (string) $payload['lid'] : null,
                'phone_number' => filled($payload['phone_number'] ?? null) ? (string) $payload['phone_number'] : null,
                'contact_name' => filled($payload['contact_name'] ?? null) ? (string) $payload['contact_name'] : null,
                'direction' => $direction,
                'body' => $body,
                'message_id' => $messageId,
                'type' => filled($payload['type'] ?? null) ? (string) $payload['type'] : null,
                'has_media' => (bool) ($payload['has_media'] ?? false),
                'media' => is_array($media) ? $media : null,
                'lead_id' => $resolved['lead']?->id,
                'deal_id' => $resolved['deal']?->id,
                'contact_id' => $resolved['contact']?->id,
                'raw' => $raw,
                'wa_timestamp' => $waTs,
            ]);
        } catch (UniqueConstraintViolationException) {
            return null;
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function extractMessageId(array $payload): ?string
    {
        if (filled($payload['message_id'] ?? null)) {
            return (string) $payload['message_id'];
        }

        $id = $payload['id'] ?? null;
        if (is_string($id) && $id !== '') {
            return $id;
        }
        if (is_array($id)) {
            if (filled($id['_serialized'] ?? null)) {
                return (string) $id['_serialized'];
            }
            if (isset($id['id'], $id['remote'])) {
                $fromMe = ! empty($id['fromMe']) ? 'true' : 'false';

                return "{$fromMe}_{$id['remote']}_{$id['id']}";
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function findSoftDuplicate(
        string $sessionId,
        string $jid,
        array $payload,
        ?string $body,
        ?Carbon $waTs,
        string $direction,
    ): ?WhatsappMessage {
        $query = WhatsappMessage::query()
            ->where('session_id', $sessionId)
            ->where('direction', $direction)
            ->where('created_at', '>=', now()->subSeconds($direction === 'outbound' ? 60 : 15))
            ->where(function ($q) use ($jid, $payload) {
                $q->where('whatsapp_jid', $jid);
                $lid = trim((string) ($payload['lid'] ?? ''));
                if ($lid !== '') {
                    $q->orWhere('whatsapp_lid', $lid)->orWhere('whatsapp_jid', $lid);
                }
                $phone = preg_replace('/\D+/', '', (string) ($payload['phone_number'] ?? ''));
                if ($phone !== '') {
                    $q->orWhere('phone_number', $phone)
                        ->orWhere('whatsapp_jid', $phone.'@c.us')
                        ->orWhere('whatsapp_jid', $phone.'@s.whatsapp.net');
                }
            });

        if ($body === null) {
            $query->whereNull('body');
        } else {
            $query->where('body', $body);
        }

        if ($waTs) {
            $query->where(function ($q) use ($waTs) {
                $q->whereBetween('wa_timestamp', [
                    $waTs->copy()->subSeconds(5),
                    $waTs->copy()->addSeconds(5),
                ])->orWhereNull('wa_timestamp');
            });
        }

        return $query->latest('id')->first();
    }
}
