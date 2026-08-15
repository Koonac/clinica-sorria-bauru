<?php

namespace App\Services\Crm\Agent;

use App\Models\Crm\Connection;
use App\Models\Crm\PipelineStage;
use App\Models\Crm\WhatsappMessage;
use App\Services\Crm\OpenRouterAgentClient;
use App\Services\Crm\WhatsappChatHistory;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class WhatsappAgentRunner
{
    private const MAX_ROUNDS = 5;

    private const HISTORY_LIMIT = 40;

    public function __construct(
        private OpenRouterAgentClient $openRouter,
        private WhatsappAgentToolRegistry $tools,
        private WhatsappChatHistory $history,
    ) {}

    public function run(AgentContext $context): void
    {
        $messages = $this->buildMessages($context);
        $openAiTools = $this->tools->openAiTools();
        $model = $context->agent->resolvedModel();
        $enviouResposta = false;

        for ($round = 0; $round < self::MAX_ROUNDS; $round++) {
            $response = $this->openRouter->chat($messages, $openAiTools, $model);
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
        $history = $this->history->messages(
            $context->connection->id,
            $context->lead?->id,
            $context->jid,
            self::HISTORY_LIMIT,
        );

        $aiName = trim((string) ($context->connection->ai_display_name ?? ''));
        $chatMessages = [];
        foreach ($history as $msg) {
            /** @var WhatsappMessage $msg */
            $body = trim((string) ($msg->body ?? ''));
            if ($body === '') {
                if ($msg->has_media) {
                    $body = '[mídia]';
                } else {
                    continue;
                }
            }
            // Histórico outbound já vem com assinatura do sistema; remove para o
            // modelo não aprender a repetir o nome no texto de enviar_resposta.
            if ($msg->direction === 'outbound' && $aiName !== '') {
                $body = Connection::stripAiDisplayNamePrefix($body, $aiName);
                if ($body === '') {
                    continue;
                }
            }
            $chatMessages[] = [
                'role' => $msg->direction === 'outbound' ? 'assistant' : 'user',
                'content' => $body,
            ];
        }

        if ($chatMessages === []) {
            throw new RuntimeException('Sem mensagens com conteúdo para o agent responder.');
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

        $rules = trim((string) $context->agent->system_prompt);

        return <<<PROMPT
Você é o agent de atendimento WhatsApp "{$context->agent->name}".

Regras de operação (obrigatórias):
- Fale com o lead SOMENTE pela tool enviar_resposta. Texto livre / comentários NÃO são enviados ao WhatsApp.
- enviar_resposta deve conter apenas mensagem natural ao cliente (tom humano). Proibido: resumo interno, status de CRM, "mensagem enviada", "aguardar resposta do lead", "o lead já está no estágio…", checklists de qualificação, narrar tools usadas.
- Não inclua seu nome, assinatura ou prefixo no início da mensagem — o sistema adiciona automaticamente.
- Depois de mover_lead / criar_agendamento / escalar_humano / finalizar_atendimento, se precisar avisar o cliente, chame enviar_resposta com uma confirmação curta e humana — não mande relatório operacional.
- Use as tools para agir; não invente stage_id fora da lista abaixo.
- Antes de oferecer horários ao lead, chame listar_horarios_disponiveis e ofereça só o que ela retornar (sem inventar).
- Nunca cite nome, título ou descrição de outros compromissos da agenda — só horários livres.
- Antes de confirmar procedimentos, preços ou cobertura por convênio, chame consultar_servicos e use apenas o retorno. A clínica já é a deste atendimento.
- Para marcar ou remarcar horário, use criar_agendamento (por padrão cancela o agendamento anterior deste lead).
- Só use manter_anteriores=true se o lead quiser DOIS horários ao mesmo tempo.
- Se o lead pedir humano ou o caso sair do escopo, use escalar_humano.
- Quando o pedido estiver resolvido (confirmação do cliente, informação entregue, agendamento feito sem pendência), chame finalizar_atendimento após a última enviar_resposta.
- Responda em português brasileiro, de forma objetiva.
- Não invente preços, prazos ou políticas que não estejam nas regras do agent.

Contexto CRM:
- {$leadBlock}
- Estágios de lead disponíveis: {$stagesJson}
- Fuso horário: America/Sao_Paulo
- Agora: {$this->nowIso()}

Regras do agent (system prompt do cliente):
{$rules}
PROMPT;
    }

    private function nowIso(): string
    {
        return now(config('app.timezone'))->toIso8601String();
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
