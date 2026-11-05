<?php

namespace App\Services\Crm\Agent\Tools;

use App\Models\Crm\ClinicProduct;
use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\ClinicProductCatalog;
use RuntimeException;

class ConsultarProdutosTool implements AgentTool
{
    public function __construct(private ClinicProductCatalog $catalog) {}

    public function name(): string
    {
        return 'consultar_produtos';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Consulta as peças cadastradas desta loja de roupas (nome, preço, categoria, público, tamanhos, cores, descrição e imagem). Use ANTES de confirmar qualquer peça, preço, tamanho ou cor ao cliente.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'id' => [
                        'type' => 'string',
                        'description' => 'ID numérico da peça para detalhe.',
                    ],
                    'q' => [
                        'type' => 'string',
                        'description' => 'Busca livre (nome, descrição, cor, categoria). Ex.: "vestido floral", "jeans preto".',
                    ],
                    'categoria' => [
                        'type' => 'string',
                        'enum' => ClinicProduct::CATEGORIES,
                        'description' => 'Filtra por categoria da peça.',
                    ],
                    'publico' => [
                        'type' => 'string',
                        'enum' => ClinicProduct::AUDIENCES,
                        'description' => 'Filtra por público.',
                    ],
                    'tamanho' => [
                        'type' => 'string',
                        'enum' => ClinicProduct::SIZES,
                        'description' => 'Só peças disponíveis neste tamanho.',
                    ],
                    'limite' => [
                        'type' => 'integer',
                        'description' => 'Máximo de peças (1–50). Default 20.',
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
            $produto = $this->catalog->find($id);
            if (! $produto) {
                throw new RuntimeException("Peça não encontrada: {$id}");
            }

            return [
                'ok' => true,
                'produto' => $produto,
                'aviso' => 'Use apenas estes dados ao confirmar preço, tamanho ou cor ao cliente.',
            ];
        }

        return $this->catalog->search($arguments);
    }
}
