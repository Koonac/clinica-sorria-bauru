<?php

namespace App\Services\Crm\Agent\Tools;

use App\Models\Crm\Appointment;
use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\Appointments\RegisterPreBooking;
use RuntimeException;

class RegistrarPreAgendamentoTool implements AgentTool
{
    public function __construct(private RegisterPreBooking $register) {}

    public function name(): string
    {
        return 'registrar_pre_agendamento';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Registra o pré-agendamento do lead (dia/horário preferido) e avisa a recepção, que vai confirmar o horário final. NÃO marca na agenda. Substitui um pré-agendamento pendente anterior deste lead.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'preferencia' => [
                        'type' => 'string',
                        'description' => 'Preferência do paciente em texto, ex.: "terça à tarde", "dia 12 às 9h", "qualquer manhã da semana que vem".',
                    ],
                    'data_hora_preferida' => [
                        'type' => 'string',
                        'description' => 'Se o paciente indicou um horário exato, em ISO-8601 (fuso America/Sao_Paulo). Opcional.',
                    ],
                    'servico_id' => [
                        'type' => 'integer',
                        'description' => 'id do serviço retornado por consultar_servicos, se o procedimento for conhecido. Opcional.',
                    ],
                    'observacoes' => [
                        'type' => 'string',
                        'description' => 'Observações úteis para a recepção (ex.: primeira consulta, convênio). Opcional.',
                    ],
                ],
                'required' => ['preferencia'],
            ],
        ];
    }

    public function handle(array $arguments, AgentContext $context): array
    {
        if (! $context->lead) {
            throw new RuntimeException('Não há lead associado a esta conversa para pré-agendar.');
        }

        $appointment = $this->register->handle(
            $context->lead,
            [
                'preferred_text' => (string) ($arguments['preferencia'] ?? ''),
                'preferred_start_at' => $arguments['data_hora_preferida'] ?? null,
                'clinic_service_id' => isset($arguments['servico_id']) ? (int) $arguments['servico_id'] : null,
                'notes' => (string) ($arguments['observacoes'] ?? ''),
            ],
            $context->user->id,
            Appointment::SOURCE_AI,
        );

        return [
            'ok' => true,
            'pre_agendamento_id' => $appointment->id,
            'preferencia' => $appointment->preferred_text,
            'servico' => $appointment->service?->name,
            'aviso' => 'Diga ao paciente que a recepção vai confirmar o horário em breve. Não confirme o horário como marcado.',
        ];
    }
}
