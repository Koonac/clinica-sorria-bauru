<?php

namespace App\Services\Crm\Agent;

use App\Models\Clinic;
use App\Models\Crm\Appointment;
use App\Models\Crm\Connection;
use App\Models\Crm\PipelineStage;
use App\Models\Crm\WhatsappAttendanceSegment;
use App\Models\Crm\WhatsappMessage;
use App\Services\Crm\Agent\Tools\EscalarHumanoTool;
use App\Services\Crm\FinalizeWhatsappConversationForLead;
use App\Services\Crm\Knowledge\BuildClinicKnowledgePrompt;
use App\Models\LlmTokenUsage;
use App\Services\Crm\OpenRouterAgentClient;
use App\Services\Crm\WhatsappChatHistory;
use Illuminate\Support\Facades\Log;

class WhatsappAgentRunner
{
    private const MAX_ROUNDS = 5;

    private const DEFAULT_HISTORY_LIMIT = 40;

    private const PRIOR_SUMMARY_LIMIT = 5;

    public function __construct(
        private OpenRouterAgentClient $openRouter,
        private WhatsappAgentToolRegistry $tools,
        private WhatsappChatHistory $history,
        private BuildClinicKnowledgePrompt $knowledge,
    ) {}

    public function run(AgentContext $context): void
    {
        $messages = $this->buildMessages($context);
        if ($messages === []) {
            Log::info('WhatsApp agent sem mensagens com conteúdo.', [
                'user_id' => $context->user->id,
                'agent_id' => $context->agent->id,
                'chat_key' => $context->chatKey,
            ]);

            return;
        }

        $openAiTools = $this->tools->openAiTools($context);
        $model = $context->agent->resolvedModel();
        $enviouResposta = false;

        for ($round = 0; $round < self::MAX_ROUNDS; $round++) {
            $response = $this->openRouter->chat(
                $messages,
                $openAiTools,
                $model,
                LlmTokenUsage::PURPOSE_AGENT_CHAT,
                $context->connection->clinic_id,
            );
            $toolCalls = $response['tool_calls'];

            if ($toolCalls === []) {
                $content = is_string($response['content'] ?? null)
                    ? trim((string) $response['content'])
                    : '';

                // Fallback: alguns modelos respondem em texto livre sem chamar a tool.
                // Só envia se ainda não houve enviar_resposta nesta execução e o texto
                // não parece nota interna / status de CRM.
                if ($content !== '' && ! $enviouResposta && ! $this->looksLikeInternalNote($content)) {
                    $this->tools->execute('enviar_resposta', ['texto' => $content], $context);
                } elseif ($content !== '') {
                    Log::debug('WhatsApp agent ignorou texto livre.', [
                        'user_id' => $context->user->id,
                        'agent_id' => $context->agent->id,
                        'chat_key' => $context->chatKey,
                        'enviou_resposta' => $enviouResposta,
                        'internal_note' => $this->looksLikeInternalNote($content),
                        'preview' => mb_substr($content, 0, 120),
                    ]);
                }

                return;
            }

            $messages[] = $response['raw_message'];

            foreach ($toolCalls as $call) {
                $callId = (string) ($call['id'] ?? uniqid('call_', true));
                $fn = $call['function'] ?? [];
                $name = (string) ($fn['name'] ?? '');
                $argsJson = (string) ($fn['arguments'] ?? '{}');
                $args = json_decode($argsJson, true);
                if (! is_array($args)) {
                    $args = [];
                }

                $result = $this->tools->execute($name, $args, $context);
                if ($name === 'enviar_resposta' && ($result['ok'] ?? false)) {
                    $enviouResposta = true;
                }

                $messages[] = [
                    'role' => 'tool',
                    'tool_call_id' => $callId,
                    'content' => json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ];

                if ($name === 'escalar_humano' && ($result['ok'] ?? false)) {
                    return;
                }

                if ($name === 'finalizar_atendimento' && ($result['ok'] ?? false)) {
                    return;
                }
            }
        }

        Log::warning('WhatsApp agent atingiu o limite de rounds.', [
            'user_id' => $context->user->id,
            'agent_id' => $context->agent->id,
            'chat_key' => $context->chatKey,
        ]);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function buildMessages(AgentContext $context): array
    {
        $since = null;
        if ($context->lead) {
            $openSegment = WhatsappAttendanceSegment::query()
                ->where('lead_id', $context->lead->id)
                ->whereNull('ended_at')
                ->latest('id')
                ->first();
            $since = $openSegment?->started_at;
        }

        $historyLimit = $context->connection->resolvedAgentHistoryLimit();
        if ($historyLimit < 1) {
            $historyLimit = self::DEFAULT_HISTORY_LIMIT;
        }

        $history = $this->history->messages(
            $context->connection->id,
            $context->lead?->id,
            $context->jid,
            $historyLimit,
            $since,
        );

        $aiName = trim((string) ($context->connection->ai_display_name ?? ''));
        $systemNotices = $this->systemNoticeBodies($context->connection);
        $chatMessages = [];
        foreach ($history as $msg) {
            /** @var WhatsappMessage $msg */
            $body = $msg->textForAgent();
            if ($body === '') {
                continue;
            }
            // Histórico outbound já vem com assinatura do sistema; remove para o
            // modelo não aprender a repetir o nome no texto de enviar_resposta.
            if ($msg->direction === 'outbound' && $aiName !== '') {
                $body = Connection::stripAiDisplayNamePrefix($body, $aiName);
                if ($body === '') {
                    continue;
                }
            }
            if ($this->isSystemNoticeBody($body, $systemNotices)) {
                continue;
            }
            $chatMessages[] = [
                'role' => $msg->direction === 'outbound' ? 'assistant' : 'user',
                'content' => $body,
            ];
        }

        if ($chatMessages === []) {
            return [];
        }

        return [
            ['role' => 'system', 'content' => $this->systemPrompt($context)],
            ...$chatMessages,
        ];
    }

    private function systemPrompt(AgentContext $context): string
    {
        $stages = $context->leadStages !== []
            ? $context->leadStages
            : PipelineStage::ofKind('lead')
                ->where('active', true)
                ->orderBy('position')
                ->get(['id', 'name', 'is_lost'])
                ->map(fn ($s) => [
                    'id' => (int) $s->id,
                    'name' => (string) $s->name,
                    'is_lost' => (bool) $s->is_lost,
                ])
                ->all();

        $stagesJson = json_encode($stages, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $lead = $context->lead;
        if ($lead) {
            $stageName = $lead->stage?->name ?? 'null';
            $leadBlock = 'Lead id='.$lead->id
                .'; nome='.($lead->name ?? '')
                .'; telefone='.($lead->mobile ?? '')
                .'; estágio_atual_id='.($lead->stage_id ?? 'null')
                .'; estágio_nome='.$stageName;
        } else {
            $leadBlock = 'Sem lead vinculado.';
        }

        $priorSummaries = $this->priorAttendanceSummariesBlock($context);
        $rules = trim((string) $context->agent->system_prompt);
        $schedulingRules = $this->schedulingRules($context);
        $appointmentsBlock = $this->appointmentsBlock($context);
        $knowledgeBlock = $this->knowledgeBlock();
        $signalsBlock = $context->handoffSignals !== []
            ? "\nAtenção: a mensagem atual do paciente tem sinais de ".implode(', ', $context->handoffSignals)
                .'. Avalie com cuidado se é caso de escalar_humano (com a categoria certa) antes de responder.'."\n"
            : '';

        $clinicName = $this->clinicName($context->connection->clinic_id);
        $clinicIntro = $clinicName !== ''
            ? " da clínica \"{$clinicName}\". Você trabalha exclusivamente para essa clínica e fala em nome dela"
            : '';

        return <<<PROMPT
Você é o agent de atendimento WhatsApp "{$context->agent->name}"{$clinicIntro}.

Regras de operação (obrigatórias):
- Fale com o lead SOMENTE pela tool enviar_resposta. Texto livre / comentários NÃO são enviados ao WhatsApp.
- enviar_resposta deve conter apenas mensagem natural ao cliente (tom humano). Proibido: resumo interno, status de CRM, "mensagem enviada", "aguardar resposta do lead", "o lead já está no estágio…", checklists de qualificação, narrar tools usadas.
- Não inclua seu nome, assinatura ou prefixo no início da mensagem — o sistema adiciona automaticamente.
- Depois de mover_lead / criar_agendamento / escalar_humano / finalizar_atendimento, se precisar avisar o cliente, chame enviar_resposta com uma confirmação curta e humana — não mande relatório operacional.
- Use as tools para agir; não invente stage_id fora da lista abaixo.
- Antes de oferecer horários ao lead, chame listar_horarios_disponiveis e ofereça só o que ela retornar (sem inventar).
- Nunca cite nome, título ou descrição de outros compromissos da agenda — só horários livres.
- Antes de confirmar procedimentos, preços ou cobertura por convênio, chame consultar_servicos e use apenas o retorno. A clínica já é a deste atendimento.
{$schedulingRules}
- Se o lead responder a um lembrete de consulta (confirmar presença ou desmarcar), use atualizar_consulta com o id do bloco "Consultas do lead".
- Use escalar_humano (sempre com categoria) quando:
  • urgencia_dor: dor forte, sangramento, inchaço, dente quebrado/trauma, febre ou complicação após procedimento. Antes, mande uma mensagem curta e acolhedora dizendo que a equipe vai falar com ele agora; se houver inchaço que dificulte respirar/engolir ou sangramento intenso, oriente procurar um pronto-atendimento imediatamente.
  • reclamacao: insatisfação, cobrança indevida, problema com tratamento ou atendimento.
  • pedido_humano: o lead pede para falar com atendente, pessoa, recepção ou dentista.
  • fora_escopo / outro: o caso sai do que você pode resolver.
- Quando o pedido estiver resolvido (confirmação do cliente, informação entregue, agendamento feito sem pendência), chame finalizar_atendimento após a última enviar_resposta.
- Responda em português brasileiro, de forma objetiva.
- Não invente preços, prazos, endereço, horários, convênios ou políticas que não estejam nas Informações da clínica, no retorno das tools ou nas regras do agent. Se não souber, diga que vai verificar e use escalar_humano(categoria=outro).
- Aja com base nas mensagens do atendimento ATUAL. Resumos de atendimentos anteriores são só contexto — não escale nem finalize só porque o histórico antigo menciona handoff ou encerramento.

Contexto CRM:
- {$leadBlock}
- Estágios de lead disponíveis: {$stagesJson}
- Fuso horário: America/Sao_Paulo
- Agora: {$this->nowIso()}
{$this->calendarBlock($context->connection->clinic_id)}
{$appointmentsBlock}{$priorSummaries}{$signalsBlock}{$knowledgeBlock}
Regras do agent (system prompt do cliente):
{$rules}
PROMPT;
    }

    private function clinicName(?int $clinicId): string
    {
        if (! $clinicId) {
            return '';
        }

        return trim((string) Clinic::query()->whereKey($clinicId)->value('name'));
    }

    private function schedulingRules(AgentContext $context): string
    {
        if ($context->connection->isPreBookingMode()) {
            return implode("\n", [
                '- Agendamento nesta clínica é por PRÉ-AGENDAMENTO: você não marca na agenda. Colete o dia/horário preferido (e o procedimento, se souber) e chame registrar_pre_agendamento.',
                '- Depois diga ao paciente que a recepção vai confirmar o horário em breve. Nunca diga que o horário está marcado.',
                '- Pode usar listar_horarios_disponiveis para sugerir horários livres, mas a confirmação final é da recepção.',
            ]);
        }

        return implode("\n", [
            '- Para marcar ou remarcar horário, use criar_agendamento (por padrão cancela o agendamento anterior deste lead).',
            '- Só use manter_anteriores=true se o lead quiser DOIS horários ao mesmo tempo.',
        ]);
    }

    private function appointmentsBlock(AgentContext $context): string
    {
        if (! $context->lead) {
            return '';
        }

        $appointments = $context->lead->upcomingAppointments()
            ->with('service:id,name')
            ->limit(5)
            ->get();

        if ($appointments->isEmpty()) {
            return '';
        }

        $tz = config('app.timezone');
        $items = $appointments->map(fn (Appointment $a) => array_filter([
            'id' => $a->id,
            'status' => $a->status,
            'inicio' => $a->starts_at?->timezone($tz)->toIso8601String(),
            'preferencia' => $a->status === Appointment::STATUS_PRE_BOOKED ? $a->preferred_text : null,
            'titulo' => $a->title,
            'servico' => $a->service?->name,
            'lembrete_enviado' => $a->reminder_sent_at !== null ? true : null,
        ], fn ($v) => $v !== null))->values()->all();

        return '- Consultas do lead: '.json_encode($items, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n";
    }

    private function knowledgeBlock(): string
    {
        $text = $this->knowledge->handle();
        if ($text === '') {
            return '';
        }

        return "\nInformações da clínica (fonte oficial — use para responder endereço, convênios, pagamento e dúvidas frequentes; dias e horários de atendimento vêm do calendário acima):\n".$text."\n";
    }

    private function priorAttendanceSummariesBlock(AgentContext $context): string
    {
        if (! $context->lead) {
            return '';
        }

        $segments = WhatsappAttendanceSegment::query()
            ->where('lead_id', $context->lead->id)
            ->whereNotNull('ended_at')
            ->whereNotNull('ai_summary')
            ->where('ai_summary', '!=', '')
            ->orderByDesc('ended_at')
            ->limit(self::PRIOR_SUMMARY_LIMIT)
            ->get(['ended_at', 'ai_summary']);

        if ($segments->isEmpty()) {
            return '';
        }

        $lines = [
            '',
            'Histórico de atendimentos anteriores (resumo; NÃO são mensagens atuais — não escale/finalize só por causa deles):',
        ];

        foreach ($segments->reverse() as $segment) {
            $date = $segment->ended_at?->timezone(config('app.timezone'))->format('Y-m-d H:i') ?? '?';
            $summary = trim((string) $segment->ai_summary);
            $lines[] = "- [{$date}]: {$summary}";
        }

        $lines[] = '';

        return implode("\n", $lines);
    }

    /**
     * @return list<string>
     */
    private function systemNoticeBodies(Connection $connection): array
    {
        $notices = [
            EscalarHumanoTool::TRANSFER_NOTICE,
            FinalizeWhatsappConversationForLead::DEFAULT_FINALIZE_NOTICE,
        ];

        $configured = trim((string) ($connection->whatsapp_finalize_notice ?? ''));
        if ($configured !== '') {
            $notices[] = $configured;
        }

        return array_values(array_unique($notices));
    }

    /**
     * @param  list<string>  $notices
     */
    private function isSystemNoticeBody(string $body, array $notices): bool
    {
        $normalized = trim($body);
        foreach ($notices as $notice) {
            if ($notice !== '' && $normalized === $notice) {
                return true;
            }
        }

        return false;
    }

    private function nowIso(): string
    {
        return now(config('app.timezone'))->toIso8601String();
    }

    /**
     * Calendário pronto dos próximos dias: o modelo erra dia da semana quando calcula sozinho.
     */
    private function calendarBlock(?int $clinicId): string
    {
        $today = now(config('app.timezone'))->locale('pt_BR');
        $clinic = $clinicId ? Clinic::query()->find($clinicId) : null;
        $hours = $clinic?->resolvedBusinessHours() ?? [];

        $lines = [
            '- HOJE é '.$today->translatedFormat('l, d/m/Y').', '.$today->format('H:i').' (horário de Brasília).',
        ];
        if ($clinic) {
            $lines[] = '- Horário de atendimento da clínica: '.$clinic->businessHoursSummary().'. Nunca ofereça horário fora disso.';
        }
        $lines[] = '- Calendário dos próximos dias (use SEMPRE esta lista para saber o dia da semana de uma data; nunca calcule de cabeça):';
        for ($i = 0; $i < 14; $i++) {
            $day = $today->copy()->addDays($i);
            $prefix = match ($i) {
                0 => 'hoje: ',
                1 => 'amanhã: ',
                default => '',
            };
            $range = $hours[$day->dayOfWeekIso] ?? null;
            $status = ! $clinic ? '' : ($range ? " — aberto {$range['start']}–{$range['end']}" : ' — FECHADO');
            $lines[] = '  • '.$prefix.$day->translatedFormat('l, d/m/Y').' ('.$day->toDateString().')'.$status;
        }
        $lines[] = '- Ao chamar listar_horarios_disponiveis, passe sempre o parâmetro data (YYYY-MM-DD) do dia que o paciente pediu.';

        return implode("\n", $lines);
    }

    /**
     * Detecta comentários operacionais que não devem ir ao WhatsApp do lead.
     */
    private function looksLikeInternalNote(string $text): bool
    {
        $patterns = [
            '/mensagem enviada[!.,]?/iu',
            '/aguardar (a )?resposta do lead/iu',
            '/\bo lead já está\b/iu',
            '/resumo da qualifica/iu',
            '/estágio\s+[\"“]?qualificado/iu',
            '/agora é aguardar/iu',
            '/\b(crm|pipeline)\b.*\b(movido|atualizado)\b/iu',
            '/tool(s)? (usada|executada|chamada)/iu',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $text) === 1) {
                return true;
            }
        }

        return false;
    }
}
