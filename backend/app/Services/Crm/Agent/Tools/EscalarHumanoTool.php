<?php

namespace App\Services\Crm\Agent\Tools;

use App\Models\Crm\Activity;
use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use RuntimeException;

class EscalarHumanoTool implements AgentTool
{
    public function name(): string
    {
        return 'escalar_humano';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Pausa o atendimento automático deste lead e registra handoff para um humano. Use quando o lead pedir atendente, o caso estiver fora do escopo ou houver risco/reclamação.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'motivo' => [
                        'type' => 'string',
                        'description' => 'Motivo do handoff',
                    ],
                ],
                'required' => ['motivo'],
            ],
        ];
    }

    public function handle(array $arguments, AgentContext $context): array
    {
        $motivo = trim((string) ($arguments['motivo'] ?? ''));
        if ($motivo === '') {
            throw new RuntimeException('motivo é obrigatório.');
        }

        if (! $context->lead) {
            throw new RuntimeException('Não há lead associado a esta conversa para pausar o agent.');
        }

        $context->lead->forceFill([
            'whatsapp_agent_paused_at' => now(),
        ])->save();

        Activity::create([
            'type' => 'note',
            'subject' => 'Agent escalou para humano',
            'body' => $motivo,
            'lead_id' => $context->lead->id,
            'deal_id' => $context->deal?->id,
            'user_id' => $context->user->id,
            'meta' => [
                'agent_id' => $context->agent->id,
                'agent_name' => $context->agent->name,
                'handoff' => true,
            ],
        ]);

        return [
            'ok' => true,
            'paused' => true,
            'lead_id' => $context->lead->id,
            'motivo' => $motivo,
        ];
    }
}
