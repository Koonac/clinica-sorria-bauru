<?php

namespace App\Services\Crm\Agent\Tools;

use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\FaixaPrecoCatalog;
use RuntimeException;

class ConsultarFaixasPrecosTool implements AgentTool
{
    public function __construct(private FaixaPrecoCatalog $catalog) {}

    public function name(): string
    {
        return 'consultar_faixas_precos';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Consulta faixas estimativas de preços no catálogo (móveis planejados, proteção veicular, energia solar, etc.). Use com os parâmetros coletados do lead antes de passar valores. Não invente preços fora do retorno.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'id' => [
                        'type' => 'string',
                        'description' => 'ID da faixa (prc-001) para detalhe.',
                    ],
                    'categoria' => [
                        'type' => 'string',
                        'description' => 'moveis_planejados | protecao_veicular | energia_solar',
                    ],
                    'q' => [
                        'type' => 'string',
                        'description' => 'Busca textual (produto, observações).',
                    ],
                    'ambiente' => [
                        'type' => 'string',
                        'description' => 'Para móveis: cozinha | quarto | sala',
                    ],
                    'metragem_m2' => [
                        'type' => 'number',
                        'description' => 'Metragem do ambiente (móveis planejados).',
                    ],
                    'tipo_veiculo' => [
                        'type' => 'string',
                        'description' => 'carro | moto',
                    ],
                    'cobertura' => [
                        'type' => 'string',
                        'description' => 'essencial | completo',
                    ],
                    'valor_fipe' => [
                        'type' => 'number',
                        'description' => 'Valor FIPE aproximado do veículo.',
                    ],
                    'tipo' => [
                        'type' => 'string',
                        'description' => 'Para solar: residencial | comercial',
                    ],
                    'consumo_kwh_mes' => [
                        'type' => 'number',
                        'description' => 'Consumo médio mensal em kWh (energia solar).',
                    ],
                    'preco_min' => [
                        'type' => 'number',
                        'description' => 'Filtra faixas cujo máximo seja >= este valor.',
                    ],
                    'preco_max' => [
                        'type' => 'number',
                        'description' => 'Filtra faixas cujo mínimo seja <= este valor.',
                    ],
                    'limite' => [
                        'type' => 'integer',
                        'description' => 'Máximo de resultados (1–20). Default 8.',
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
            $faixa = $this->catalog->find($id);
            if (! $faixa) {
                throw new RuntimeException("Faixa de preço não encontrada: {$id}");
            }

            return [
                'ok' => true,
                'mock' => true,
                'faixa' => $faixa,
                'aviso' => 'Estimativa fictícia (mock). Deixe claro ao lead que é faixa aproximada, não orçamento fechado.',
            ];
        }

        return $this->catalog->search($arguments);
    }
}
