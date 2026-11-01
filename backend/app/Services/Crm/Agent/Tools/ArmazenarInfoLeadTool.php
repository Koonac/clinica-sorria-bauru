<?php

namespace App\Services\Crm\Agent\Tools;

use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\StoreLeadQualificationData;
use RuntimeException;

class ArmazenarInfoLeadTool implements AgentTool
{
    public function __construct(private StoreLeadQualificationData $store) {}

    public function name(): string
    {
        return 'armazenar_info_lead';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Grava no cartão do lead um dado de qualificação já descoberto (campo cadastrado no agent). Use assim que o lead informar o valor — não apenas mencione no chat.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'campo' => [
                        'type' => 'string',
                        'description' => 'Chave (key) do campo de qualificação cadastrado no agent',
                    ],
                    'valor' => [
                        'type' => 'string',
                        'description' => 'Valor descoberto, em texto curto',
                    ],
                ],
                'required' => ['campo', 'valor'],
            ],
        ];
    }

    public function handle(array $arguments, AgentContext $context): array
    {
        if (! $context->lead) {
            throw new RuntimeException('Não há lead associado a esta conversa.');
        }

        $campo = trim((string) ($arguments['campo'] ?? ''));
        $valor = trim((string) ($arguments['valor'] ?? ''));

        if ($campo === '') {
            throw new RuntimeException('Informe o campo a gravar.');
        }
        if ($valor === '') {
            throw new RuntimeException('Informe o valor descoberto.');
        }

        $fields = $context->agent->normalizedQualificationFields();
        if ($fields === []) {
            throw new RuntimeException('Nenhum campo de qualificação está configurado neste agent.');
        }

        $field = $context->agent->findQualificationField($campo);
        if ($field === null) {
            $keys = implode(', ', array_column($fields, 'key'));

            throw new RuntimeException("Campo \"{$campo}\" não está na lista de qualificação do agent. Use um destes: {$keys}.");
        }

        $lead = $this->store->handle($context->lead, $field['key'], $valor, $field['label']);
        $context->lead = $lead;

        return [
            'ok' => true,
            'lead_id' => $lead->id,
            'campo' => $field['key'],
            'label' => $field['label'],
            'valor' => $valor,
        ];
    }
}
