<?php

namespace App\Services\Crm\Agent\Tools;

use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\MoveLead;
use RuntimeException;

class MoverLeadTool implements AgentTool
{
    public function __construct(private MoveLead $moveLead) {}

    public function name(): string
    {
        return 'mover_lead';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Move o card do lead no pipeline do CRM para o stage_id informado. Se o estágio for perdido (is_lost), informe lost_reason.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'stage_id' => [
                        'type' => 'integer',
                        'description' => 'ID do estágio de destino (use apenas IDs da lista de estágios do contexto)',
                    ],
                    'lost_reason' => [
                        'type' => 'string',
                        'description' => 'Motivo da perda (obrigatório se o estágio for is_lost)',
                    ],
                ],
                'required' => ['stage_id'],
            ],
        ];
    }

    public function handle(array $arguments, AgentContext $context): array
    {
        if (! $context->lead) {
            throw new RuntimeException('Não há lead associado a esta conversa.');
        }

        $stageId = (int) ($arguments['stage_id'] ?? 0);
        if ($stageId <= 0) {
            throw new RuntimeException('stage_id inválido.');
        }

        $lostReason = isset($arguments['lost_reason'])
            ? trim((string) $arguments['lost_reason'])
            : null;

        $lead = $this->moveLead->handle(
            $context->lead,
            $stageId,
            $context->user->id,
            $lostReason !== '' ? $lostReason : null,
        );

        $context->lead = $lead;

        return [
            'ok' => true,
            'lead_id' => $lead->id,
            'stage_id' => $lead->stage_id,
            'stage_name' => $lead->stage?->name,
            'status' => $lead->status,
        ];
    }
}
