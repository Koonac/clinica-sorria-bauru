<?php

namespace App\Services\Crm\Agent\Tools;

use App\Models\Crm\WhatsappMessage;
use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\WhatsappApiClient;
use App\Services\Crm\WhatsappLeadResolver;
use RuntimeException;

class EnviarRespostaTool implements AgentTool
{
    public function __construct(private WhatsappLeadResolver $leadResolver) {}

    public function name(): string
    {
        return 'enviar_resposta';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Envia ao lead uma mensagem de WhatsApp voltada ao cliente. Use só texto natural de atendimento. Nunca envie notas internas, status de CRM, resumos de qualificação ou comentários do tipo "aguardar resposta".',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'texto' => [
                        'type' => 'string',
                        'description' => 'Texto da mensagem a enviar',
                    ],
                ],
                'required' => ['texto'],
            ],
        ];
    }

    public function handle(array $arguments, AgentContext $context): array
    {
        $texto = trim((string) ($arguments['texto'] ?? ''));
        if ($texto === '') {
            throw new RuntimeException('texto é obrigatório.');
        }

        $user = $context->user;
        if ($user->whatsapp_status !== 'connected' || ! filled($user->whatsapp_session_id)) {
            throw new RuntimeException('WhatsApp não está conectado.');
        }

        $client = new WhatsappApiClient($user);
        $to = $context->jid;
        $result = $client->send($user->whatsapp_session_id, $to, $texto);

        $resultTo = is_string($result['to'] ?? null) ? $result['to'] : $to;
        $messageId = isset($result['messageId']) ? (string) $result['messageId'] : null;

        $resolved = $this->leadResolver->resolve($user, [
            'jid' => $to,
            'phone_number' => $context->lead?->mobile,
            'contact_name' => $context->lead?->name,
        ]);

        // Evita duplicata se o webhook message_create ganhou a corrida.
        $existing = null;
        if ($messageId) {
            $existing = WhatsappMessage::query()
                ->where('session_id', $user->whatsapp_session_id)
                ->where('message_id', $messageId)
                ->first();
        }
        if (! $existing) {
            $existing = WhatsappMessage::query()
                ->where('session_id', $user->whatsapp_session_id)
                ->where('direction', 'outbound')
                ->where('body', $texto)
                ->where('created_at', '>=', now()->subSeconds(60))
                ->where(function ($q) use ($to, $resultTo, $context) {
                    $q->where('whatsapp_jid', $to)
                        ->orWhere('whatsapp_jid', $resultTo);
                    if ($context->lead?->whatsapp_jid) {
                        $q->orWhere('whatsapp_jid', $context->lead->whatsapp_jid);
                    }
                    if ($context->lead?->mobile) {
                        $q->orWhere('phone_number', $context->lead->mobile);
                    }
                })
                ->latest('id')
                ->first();
        }

        if ($existing) {
            if ($messageId && ! $existing->message_id) {
                $existing->forceFill(['message_id' => $messageId])->save();
            }

            return [
                'ok' => true,
                'whatsapp_message_id' => $existing->id,
                'texto' => $texto,
                'deduped' => true,
            ];
        }

        $record = WhatsappMessage::create([
            'user_id' => $user->id,
            'session_id' => $user->whatsapp_session_id,
            'whatsapp_jid' => $resultTo ?: $to,
            'phone_number' => $resolved['lead']?->mobile ?? $context->lead?->mobile,
            'contact_name' => $resolved['lead']?->name ?? $context->lead?->name,
            'direction' => 'outbound',
            'body' => $texto,
            'message_id' => $messageId ?: null,
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $context->lead?->id ?? $resolved['lead']?->id,
            'deal_id' => $context->deal?->id ?? $resolved['deal']?->id,
            'contact_id' => $resolved['contact']?->id,
            'raw' => $result,
            'wa_timestamp' => now(),
        ]);

        return [
            'ok' => true,
            'whatsapp_message_id' => $record->id,
            'texto' => $texto,
        ];
    }
}
