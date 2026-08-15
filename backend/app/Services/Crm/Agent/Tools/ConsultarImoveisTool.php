<?php

namespace App\Services\Crm\Agent\Tools;

use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\ImovelCatalog;
use RuntimeException;

class ConsultarImoveisTool implements AgentTool
{
    public function __construct(private ImovelCatalog $catalog) {}

    public function name(): string
    {
        return 'consultar_imoveis';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Consulta o catálogo de imóveis da imobiliária (API do backend). Use antes de sugerir imóveis ao lead. Não invente imóveis fora do retorno. Pode buscar por filtros ou por id/código.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'id' => [
                        'type' => 'string',
                        'description' => 'ID (imo-001) ou código (APT-102) para detalhe de um imóvel.',
                    ],
                    'q' => [
                        'type' => 'string',
                        'description' => 'Busca textual livre (título, bairro, descrição, código).',
                    ],
                    'cidade' => [
                        'type' => 'string',
                        'description' => 'Cidade (ex.: Bauru).',
                    ],
                    'bairro' => [
                        'type' => 'string',
                        'description' => 'Bairro (ex.: Jardim Contorno).',
                    ],
                    'tipo' => [
                        'type' => 'string',
                        'description' => 'apartamento | casa | studio | terreno',
                    ],
                    'finalidade' => [
                        'type' => 'string',
                        'description' => 'venda | aluguel',
                    ],
                    'quartos_min' => [
                        'type' => 'integer',
                        'description' => 'Mínimo de quartos.',
                    ],
                    'preco_min' => [
                        'type' => 'number',
                        'description' => 'Preço mínimo (venda = valor do imóvel; aluguel = mensal).',
                    ],
                    'preco_max' => [
                        'type' => 'number',
                        'description' => 'Preço máximo.',
                    ],
                    'destaque' => [
                        'type' => 'boolean',
                        'description' => 'Se true, só imóveis em destaque.',
                    ],
                    'status' => [
                        'type' => 'string',
                        'description' => 'disponivel (default) | reservado | todos',
                    ],
                    'limite' => [
                        'type' => 'integer',
                        'description' => 'Máximo de resultados (1–20). Default 5.',
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
            $imovel = $this->catalog->find($id);
            if (! $imovel) {
                throw new RuntimeException("Imóvel não encontrado: {$id}");
            }

            return [
                'ok' => true,
                'mock' => true,
                'imovel' => $imovel,
                'aviso' => 'Dados fictícios (mock). Ao falar com o lead, use só estes dados; pode citar o link das imagens.',
            ];
        }

        return $this->catalog->search($arguments);
    }
}
