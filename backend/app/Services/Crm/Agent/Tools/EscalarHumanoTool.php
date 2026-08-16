<?php

namespace App\Services\Crm\Agent\Tools;

use App\Models\Crm\Activity;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\PauseWhatsappAgentWithAutoResumeForLead;
use App\Services\Crm\WhatsappApiClient;
use RuntimeException;

class EscalarHumanoTool implements AgentTool
{
    public const TRANSFER_NOTICE = '_[transferindo chamado]_';

    public function __construct(private PauseWhatsappAgentWithAutoResumeForLead $pauseWithResume) {}

    public function name(): string
    {
        return 'escalar_humano';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Pausa o atendimento automático deste lead, avisa o cliente com "transferindo chamado", transfere para um atendente humano aleatório e registra o handoff. Use quando o lead pedir atendente, o caso estiver fora do escopo ou houver risco/reclamação. A IA retoma automaticamente após o prazo configurado na conexão.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'motivo' => [
                        'type' => 'string',
                        'description' => 'Motivo do handoff',
                    ],
                ],
                'required' => ['motivo'],
            ],
        ];
    }

    public function handle(array $arguments, AgentContext $context): array
    {
        $motivo = trim((string) ($arguments['motivo'] ?? ''));
        if ($motivo === '') {
            throw new RuntimeException('motivo é obrigatório.');
        }

        if (! $context->lead) {
            throw new RuntimeException('Não há lead associado a esta conversa para pausar o agent.');
        }

        $this->sendTransferNotice($context);

        $attendant = $this->pickRandomAttendant($context);
        $previousOwnerId = $context->lead->owner_id;

        $context->lead->forceFill([
            'owner_id' => $attendant->id,
        ])->save();

        $lead = $context->lead->fresh() ?? $context->lead;
        $context->lead = $lead;

        $result = $this->pauseWithResume->handle(
            $lead,
            $context->connection,
            $attendant->id,
            'escalar',
        );

        Activity::create([
            'type' => 'note',
            'subject' => 'Agent escalou para humano',
            'body' => $motivo,
            'lead_id' => $lead->id,
            'deal_id' => $context->deal?->id,
            'user_id' => $context->user->id,
            'meta' => [
                'agent_id' => $context->agent->id,
                'agent_name' => $context->agent->name,
                'handoff' => true,
                'previous_owner_id' => $previousOwnerId,
                'assigned_user_id' => $attendant->id,
                'assigned_user_name' => $attendant->name,
                'resume_at' => $result['resume_at']->toIso8601String(),
                'auto_resume_hours' => $result['hours'],
            ],
        ]);

        return [
            'ok' => true,
            'paused' => true,
            'lead_id' => $lead->id,
            'owner_id' => $attendant->id,
            'owner_name' => $attendant->name,
            'motivo' => $motivo,
            'notice' => self::TRANSFER_NOTICE,
            'resume_at' => $result['resume_at']->toIso8601String(),
            'auto_resume_hours' => $result['hours'],
        ];
    }

    private function sendTransferNotice(AgentContext $context): void
    {
        $connection = $context->connection;
        if ($connection->status !== 'connected' || ! filled($connection->session_id)) {
            throw new RuntimeException('WhatsApp não está conectado.');
        }

        $texto = self::TRANSFER_NOTICE;
        $to = $context->jid;
        $result = (new WhatsappApiClient($connection))->send(
            (string) $connection->session_id,
            $to,
            $texto,
        );

        $resultTo = is_string($result['to'] ?? null) ? $result['to'] : $to;
        $messageId = isset($result['messageId']) ? (string) $result['messageId'] : null;

        $existing = null;
        if ($messageId) {
            $existing = WhatsappMessage::query()
                ->where('session_id', $connection->session_id)
                ->where('message_id', $messageId)
                ->first();
        }

        if ($existing) {
            return;
        }

        WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $context->user->id,
            'session_id' => $connection->session_id,
            'whatsapp_jid' => $resultTo ?: $to,
            'phone_number' => $context->lead?->mobile,
            'contact_name' => $context->lead?->name,
            'direction' => 'outbound',
            'body' => $texto,
            'message_id' => $messageId ?: null,
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $context->lead?->id,
            'deal_id' => $context->deal?->id,
            'contact_id' => $context->lead?->contact_id,
            'raw' => $result,
            'wa_timestamp' => now(),
        ]);
    }

    private function pickRandomAttendant(AgentContext $context): User
    {
        $clinicId = $context->lead?->clinic_id
            ?? $context->connection->clinic_id
            ?? $context->user->clinic_id;

        // Preferência: funcionários da clínica (atendentes reais).
        if ($clinicId !== null) {
            $funcionario = User::query()
                ->where('clinic_id', $clinicId)
                ->where('role', User::ROLE_FUNCIONARIO)
                ->inRandomOrder()
                ->first();

            if ($funcionario) {
                return $funcionario;
            }
        }

        // Fallback: qualquer usuário da clínica ou admin (mesma regra da lista de atendentes).
        $query = User::query()->inRandomOrder();

        if ($clinicId !== null) {
            $query->where(function ($q) use ($clinicId) {
                $q->where('clinic_id', $clinicId)
                    ->orWhere('role', User::ROLE_ADMIN);
            });
        }

        $attendant = $query->first();

        if (! $attendant) {
            throw new RuntimeException('Nenhum atendente disponível para receber o lead.');
        }

        return $attendant;
    }
}
