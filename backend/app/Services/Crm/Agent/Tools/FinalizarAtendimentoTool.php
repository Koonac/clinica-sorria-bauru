<?php

namespace App\Services\Crm\Agent\Tools;

use App\Models\Crm\Activity;
use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\FinalizeWhatsappConversationForLead;
use RuntimeException;

class FinalizarAtendimentoTool implements AgentTool
{
    public function __construct(private FinalizeWhatsappConversationForLead $finalizer) {}

    public function name(): string
    {
        return 'finalizar_atendimento';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Encerra o atendimento deste lead quando o pedido foi resolvido, o cliente confirmou ou não há mais ação. Avisa o cliente com "finalizando chamado" e fecha o chamado. Prefira chamar após a última enviar_resposta. Não use se ainda precisar de humano — nesse caso use escalar_humano.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'motivo' => [
                        'type' => 'string',
                        'description' => 'Motivo curto do encerramento (opcional)',
                    ],
                ],
                'required' => [],
            ],
        ];
    }

    public function handle(array $arguments, AgentContext $context): array
    {
        if (! $context->lead) {
            throw new RuntimeException('Não há lead associado a esta conversa para finalizar.');
        }

        $motivo = trim((string) ($arguments['motivo'] ?? ''));

        $lead = $this->finalizer->handle(
            $context->lead,
            null,
            FinalizeWhatsappConversationForLead::SOURCE_AI,
        );

        if ($motivo !== '') {
            Activity::create([
                'type' => 'note',
                'subject' => 'Motivo da finalização (IA)',
                'body' => $motivo,
                'lead_id' => $lead->id,
                'deal_id' => $context->deal?->id,
                'user_id' => $context->user->id,
                'meta' => [
                    'agent_id' => $context->agent->id,
                    'agent_name' => $context->agent->name,
                    'finalized_source' => FinalizeWhatsappConversationForLead::SOURCE_AI,
                ],
            ]);
        }

        return [
            'ok' => true,
            'finalized' => true,
            'lead_id' => $lead->id,
            'motivo' => $motivo !== '' ? $motivo : null,
        ];
    }
}
