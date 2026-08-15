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
            'description' => 'Consulta clínicas (estéticas, odontológicas, médicas particulares): procedimentos atendidos, médicos disponíveis e convênios aceitos. Use ANTES de confirmar qualquer procedimento, médico ou convênio ao lead.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'id' => [
                        'type' => 'string',
                        'description' => 'ID (cli-001) ou nome da clínica para detalhe.',
                    ],
                    'q' => [
                        'type' => 'string',
                        'description' => 'Busca livre (nome, procedimento, médico, convênio).',
                    ],
                    'tipo' => [
                        'type' => 'string',
                        'description' => 'estetica | odontologica | medica_particular',
                    ],
                    'cidade' => [
                        'type' => 'string',
                        'description' => 'Cidade (ex.: Bauru).',
                    ],
                    'bairro' => [
                        'type' => 'string',
                        'description' => 'Bairro.',
                    ],
                    'convenio' => [
                        'type' => 'string',
                        'description' => 'Convênio a checar (ex.: Unimed, Amil, Particular).',
                    ],
                    'procedimento' => [
                        'type' => 'string',
                        'description' => 'Nome ou código do procedimento (ex.: limpeza, implante, botox).',
                    ],
                    'medico_disponivel' => [
                        'type' => 'boolean',
                        'description' => 'Se true, só clínicas com pelo menos um médico disponível.',
                    ],
                    'limite' => [
                        'type' => 'integer',
                        'description' => 'Máximo de clínicas (1–20). Default 5.',
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
                'mock' => true,
                'clinica' => $clinica,
                'aviso' => 'Dados fictícios (mock). Confirme procedimentos, médicos e convênios só com base neste retorno.',
            ];
        }

        return $this->catalog->search($arguments);
    }
}
