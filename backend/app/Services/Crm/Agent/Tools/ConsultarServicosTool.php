<?php

namespace App\Services\Crm\Agent\Tools;

use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\ClinicServiceCatalog;
use RuntimeException;

class ConsultarServicosTool implements AgentTool
{
    public function __construct(private ClinicServiceCatalog $catalog) {}

    public function name(): string
    {
        return 'consultar_servicos';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Consulta os serviços/procedimentos cadastrados da clínica deste atendimento (nome, código, duração, preço particular, se aceita convênio e descrição). A clínica já é conhecida pelo contexto do lead — não precisa escolher clínica. Use ANTES de confirmar qualquer procedimento, preço ou cobertura por convênio.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'id' => [
                        'type' => 'string',
                        'description' => 'ID numérico ou código exato do serviço para detalhe.',
                    ],
                    'q' => [
                        'type' => 'string',
                        'description' => 'Busca livre (nome, código ou descrição).',
                    ],
                    'nome' => [
                        'type' => 'string',
                        'description' => 'Nome ou trecho do serviço (ex.: limpeza, implante, clareamento).',
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
                        'description' => 'Máximo de serviços (1–50). Default 20.',
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
            $servico = $this->catalog->find($id);
            if (! $servico) {
                throw new RuntimeException("Serviço não encontrado: {$id}");
            }

            return [
                'ok' => true,
                'servico' => $servico,
                'aviso' => 'Use apenas estes dados ao confirmar preço, duração ou cobertura por convênio ao lead.',
            ];
        }

        return $this->catalog->search($arguments);
    }
}
