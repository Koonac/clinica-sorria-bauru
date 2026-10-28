<?php

namespace App\Services\Crm\Agent\Tools;

use App\Models\Crm\Appointment;
use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\Appointments\CancelAppointment;
use App\Services\Crm\Appointments\MarkAppointmentConfirmed;
use RuntimeException;

class AtualizarConsultaTool implements AgentTool
{
    public function __construct(
        private MarkAppointmentConfirmed $confirm,
        private CancelAppointment $cancel,
    ) {}

    public function name(): string
    {
        return 'atualizar_consulta';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Registra a resposta do paciente sobre uma consulta já marcada (ex.: resposta ao lembrete): confirmar presença ou cancelar. Para remarcar, cancele e use o fluxo de agendamento. Use o id do bloco "Consultas do lead".',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'consulta_id' => [
                        'type' => 'integer',
                        'description' => 'id da consulta (bloco "Consultas do lead")',
                    ],
                    'acao' => [
                        'type' => 'string',
                        'enum' => ['confirmar', 'cancelar'],
                        'description' => 'confirmar = paciente confirmou presença; cancelar = paciente não vai/quer desmarcar',
                    ],
                    'motivo' => [
                        'type' => 'string',
                        'description' => 'Motivo informado pelo paciente (opcional)',
                    ],
                ],
                'required' => ['consulta_id', 'acao'],
            ],
        ];
    }

    public function handle(array $arguments, AgentContext $context): array
    {
        if (! $context->lead) {
            throw new RuntimeException('Não há lead associado a esta conversa.');
        }

        $appointment = Appointment::query()
            ->where('lead_id', $context->lead->id)
            ->find((int) ($arguments['consulta_id'] ?? 0));
        if (! $appointment) {
            throw new RuntimeException('Consulta não encontrada para este lead.');
        }

        $acao = (string) ($arguments['acao'] ?? '');
        $motivo = trim((string) ($arguments['motivo'] ?? ''));

        if ($acao === 'confirmar') {
            $appointment = $this->confirm->handle($appointment, $context->user->id, Appointment::SOURCE_AI);
        } elseif ($acao === 'cancelar') {
            $appointment = $this->cancel->handle(
                $appointment,
                $motivo !== '' ? $motivo : 'Cancelado pelo paciente via WhatsApp.',
                $context->user->id,
                Appointment::SOURCE_AI,
                true,
            );
        } else {
            throw new RuntimeException('acao deve ser confirmar ou cancelar.');
        }

        return [
            'ok' => true,
            'consulta_id' => $appointment->id,
            'status' => $appointment->status,
            'inicio' => $appointment->starts_at?->toIso8601String(),
        ];
    }
}
