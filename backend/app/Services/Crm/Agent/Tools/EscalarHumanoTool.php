<?php

namespace App\Services\Crm\Agent\Tools;

use App\Models\Crm\Activity;
use App\Models\Crm\CrmNotification;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\NotifyReception;
use App\Services\Crm\PauseWhatsappAgentWithAutoResumeForLead;
use App\Services\Crm\WhatsappApiClient;
use RuntimeException;

class EscalarHumanoTool implements AgentTool
{
    public const TRANSFER_NOTICE = '_[transferindo chamado]_';

    public const CATEGORIES = ['urgencia_dor', 'reclamacao', 'pedido_humano', 'fora_escopo', 'outro'];

    /** categoria => [tipo da notificação, prioridade, título] */
    private const NOTIFICATIONS = [
        'urgencia_dor' => [CrmNotification::TYPE_URGENCY, CrmNotification::PRIORITY_URGENT, 'Urgência: paciente com dor/sintoma'],
        'reclamacao' => [CrmNotification::TYPE_COMPLAINT, CrmNotification::PRIORITY_NORMAL, 'Reclamação de paciente'],
        'pedido_humano' => [CrmNotification::TYPE_HUMAN_REQUEST, CrmNotification::PRIORITY_NORMAL, 'Paciente pediu atendimento humano'],
        'fora_escopo' => [CrmNotification::TYPE_HANDOFF, CrmNotification::PRIORITY_NORMAL, 'IA transferiu atendimento'],
        'outro' => [CrmNotification::TYPE_HANDOFF, CrmNotification::PRIORITY_NORMAL, 'IA transferiu atendimento'],
    ];

    public function __construct(
        private PauseWhatsappAgentWithAutoResumeForLead $pauseWithResume,
        private NotifyReception $notifyReception,
    ) {}

    public function name(): string
    {
        return 'escalar_humano';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Pausa o atendimento automático deste lead, avisa o cliente com "transferindo chamado", transfere para um atendente humano, avisa a recepção e registra o handoff. Use em dor/urgência, reclamação, pedido explícito de atendente/pessoa ou caso fora do escopo. A IA retoma automaticamente após o prazo configurado na conexão.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'motivo' => [
                        'type' => 'string',
                        'description' => 'Motivo do handoff',
                    ],
                    'categoria' => [
                        'type' => 'string',
                        'enum' => self::CATEGORIES,
                        'description' => 'urgencia_dor (dor, sangramento, inchaço, trauma), reclamacao, pedido_humano (pediu atendente/pessoa), fora_escopo ou outro.',
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

        $categoria = (string) ($arguments['categoria'] ?? 'outro');
        if (! in_array($categoria, self::CATEGORIES, true)) {
            $categoria = 'outro';
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
                'categoria' => $categoria,
                'previous_owner_id' => $previousOwnerId,
                'assigned_user_id' => $attendant->id,
                'assigned_user_name' => $attendant->name,
                'resume_at' => $result['resume_at']->toIso8601String(),
                'auto_resume_hours' => $result['hours'],
            ],
        ]);

        [$type, $priority, $title] = self::NOTIFICATIONS[$categoria];
        $this->notifyReception->handle(
            (int) $lead->clinic_id,
            $type,
            $title.' → '.$attendant->name,
            $motivo,
            $lead,
            null,
            $priority,
            ['categoria' => $categoria, 'assigned_user_id' => $attendant->id],
        );

        return [
            'ok' => true,
            'paused' => true,
            'lead_id' => $lead->id,
            'owner_id' => $attendant->id,
            'owner_name' => $attendant->name,
            'motivo' => $motivo,
            'categoria' => $categoria,
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
                    ->orWhereIn('role', [User::ROLE_ADMIN, User::ROLE_DEVELOPER]);
            });
        }

        $attendant = $query->first();

        if (! $attendant) {
            throw new RuntimeException('Nenhum atendente disponível para receber o lead.');
        }

        return $attendant;
    }
}
