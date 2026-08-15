<?php

namespace App\Services\Crm\Agent\Tools;

use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\ClinicaCatalog;
use RuntimeException;

class ConsultarClinicasTool implements AgentTool
{
    public function __construct(private ClinicaCatalog $catalog) {}

    public function name(): string
    {
        return 'consultar_clinicas';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Consulta os serviços/procedimentos cadastrados da clínica atual (nome, código, duração, preço particular, se aceita convênio e descrição). Use ANTES de confirmar qualquer procedimento, preço ou cobertura por convênio ao lead.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'id' => [
                        'type' => 'string',
                        'description' => 'ID, slug ou nome da clínica para detalhe completo.',
                    ],
                    'q' => [
                        'type' => 'string',
                        'description' => 'Busca livre (nome, código ou descrição do serviço).',
                    ],
                    'procedimento' => [
                        'type' => 'string',
                        'description' => 'Nome, código ou trecho da descrição do serviço (ex.: limpeza, implante, clareamento).',
                    ],
                    'codigo' => [
                        'type' => 'string',
                        'description' => 'Código do serviço (ex.: ODO-LIMPEZA).',
                    ],
                    'aceita_convenio' => [
                        'type' => 'boolean',
                        'description' => 'Se true, só serviços que aceitam convênio; se false, só particular.',
                    ],
                    'limite' => [
                        'type' => 'integer',
                        'description' => 'Máximo de clínicas no retorno (1–20). Default 5.',
                    ],
                ],
                'required' => [],
            ],
        ];
    }

    public function handle(array $arguments, AgentContext $context): array
    {
        $id = trim((string) ($arguments['id'] ?? ''));
        if ($id !== '') {
            $clinica = $this->catalog->find($id);
            if (! $clinica) {
                throw new RuntimeException("Clínica não encontrada: {$id}");
            }

            return [
                'ok' => true,
                'mock' => false,
                'clinica' => $clinica,
                'aviso' => 'Use apenas estes serviços/procedimentos ao confirmar preços, duração ou cobertura por convênio ao lead.',
            ];
        }

        return $this->catalog->search($arguments);
    }
}
