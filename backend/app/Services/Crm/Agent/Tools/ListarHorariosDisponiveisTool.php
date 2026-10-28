<?php

namespace App\Services\Crm\Agent\Tools;

use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\ListAvailableCalendarSlots;
use Carbon\Carbon;

class ListarHorariosDisponiveisTool implements AgentTool
{
    public function __construct(private ListAvailableCalendarSlots $slots) {}

    public function name(): string
    {
        return 'listar_horarios_disponiveis';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Lista horários livres na agenda (FreeBusy). Não revela nome/descrição de outros compromissos — só slots disponíveis. Use antes de oferecer opções ao lead.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'data' => [
                        'type' => 'string',
                        'description' => 'Dia no formato YYYY-MM-DD (fuso America/Sao_Paulo). Se omitido, usa o próximo dia útil.',
                    ],
                    'dias' => [
                        'type' => 'integer',
                        'description' => 'Quantidade de dias a partir de data (1–7). Default 1.',
                    ],
                    'duracao_minutos' => [
                        'type' => 'integer',
                        'description' => 'Duração de cada slot em minutos (15–180). Default da config (60).',
                    ],
                ],
                'required' => [],
            ],
        ];
    }

    public function handle(array $arguments, AgentContext $context): array
    {
        return $this->slots->handle($arguments);
    }
}
