<?php

namespace App\Services\Crm\Agent\Tools;

use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\ClinicPropertyCatalog;
use RuntimeException;

class ConsultarImoveisTool implements AgentTool
{
    public function __construct(private ClinicPropertyCatalog $catalog) {}

    public function name(): string
    {
        return 'consultar_imoveis';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Consulta os imóveis cadastrados desta imobiliária (endereço, valor, aluguel ou compra, tipo e imagem). Use ANTES de confirmar qualquer imóvel, preço ou tipo ao lead.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'id' => [
                        'type' => 'string',
                        'description' => 'ID numérico do imóvel para detalhe.',
                    ],
                    'q' => [
                        'type' => 'string',
                        'description' => 'Busca livre (título, endereço, tipo ou aluguel/compra).',
                    ],
                    'endereco' => [
                        'type' => 'string',
                        'description' => 'Trecho do endereço ou título (ex.: Centro, Jardim, rua).',
                    ],
                    'negocio' => [
                        'type' => 'string',
                        'enum' => ['aluguel', 'compra'],
                        'description' => 'Filtra por aluguel ou compra.',
                    ],
                    'tipo' => [
                        'type' => 'string',
                        'enum' => ['residencial', 'apartamento', 'comercial', 'rural'],
                        'description' => 'Tipo do imóvel.',
                    ],
                    'limite' => [
                        'type' => 'integer',
                        'description' => 'Máximo de imóveis (1–50). Default 20.',
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
                'imovel' => $imovel,
                'aviso' => 'Use apenas estes dados ao confirmar endereço, valor ou tipo ao lead.',
            ];
        }

        return $this->catalog->search($arguments);
    }
}
