<?php

namespace App\Services\Crm;

use App\Models\Crm\Agent;
use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappMessage;
use App\Models\LlmTokenUsage;
use App\Services\Crm\Knowledge\BuildClinicKnowledgePrompt;
use Illuminate\Support\Collection;

/**
 * Escreve o texto de follow-up para quem parou de responder, com base na conversa.
 * Retorna null quando a IA julga que não faz sentido insistir (resposta PULAR).
 */
class GenerateWhatsappFollowUpMessage
{
    public const SKIP_TOKEN = 'PULAR';

    private const HISTORY_LIMIT = 20;

    public function __construct(
        private OpenRouterAgentClient $openRouter,
        private WhatsappChatHistory $history,
        private BuildClinicKnowledgePrompt $knowledge,
    ) {}

    /**
     * @param  int  $attempt  1-based: qual tentativa está sendo enviada
     */
    public function handle(Agent $agent, Connection $connection, Lead $lead, int $attempt, int $totalAttempts): ?string
    {
        $messages = $this->history->messages(
            $connection->id,
            $lead->id,
            $lead->whatsapp_jid,
            self::HISTORY_LIMIT,
        );

        $transcript = $this->transcript($messages, $connection);
        if ($transcript === '') {
            return null;
        }

        $content = $this->openRouter->complete(
            $this->systemPrompt($agent, $attempt, $totalAttempts),
            "Conversa até agora (mais antiga primeiro):\n".$transcript,
            $agent->resolvedModel(),
            LlmTokenUsage::PURPOSE_FOLLOW_UP,
            $connection->clinic_id,
        );

        $text = trim($content, " \t\n\r\0\x0B\"");
        if ($text === '' || mb_strtoupper(rtrim($text, '.!')) === self::SKIP_TOKEN) {
            return null;
        }

        $aiName = trim((string) ($connection->ai_display_name ?? ''));

        return $aiName !== '' ? Connection::stripAiDisplayNamePrefix($text, $aiName) : $text;
    }

    private function systemPrompt(Agent $agent, int $attempt, int $total): string
    {
        $tone = match (true) {
            $attempt >= $total => 'É a ÚLTIMA tentativa: despeça-se com cordialidade, sem pressão, dizendo que a clínica fica à disposição quando ele quiser retomar.',
            $attempt === 1 => 'É a primeira retomada: leve e curta, retome o ponto em que a conversa parou e faça uma pergunta simples para facilitar a resposta.',
            default => 'É um reforço: lembre o benefício do que ele procurava (sem exagerar) e ofereça ajuda concreta para o próximo passo.',
        };

        $knowledge = $this->knowledge->handle();
        $knowledgeBlock = $knowledge !== '' ? "\nInformações da clínica (fonte oficial):\n{$knowledge}\n" : '';
        $rules = trim((string) $agent->system_prompt);

        return <<<PROMPT
Você é "{$agent->name}", atendente virtual de uma clínica odontológica no WhatsApp.
O paciente parou de responder. Escreva UMA mensagem de follow-up (tentativa {$attempt} de {$total}).

Regras:
- {$tone}
- No máximo 2 frases curtas, tom humano e acolhedor, português brasileiro. Sem assinatura nem nome no início.
- Não repita a última mensagem enviada; não invente preços, horários ou promoções que não estejam nas informações abaixo.
- Se o paciente já recusou, disse que não tem interesse, pediu para não ser contatado, encerrou o assunto (ex.: "obrigado, era só isso") ou a conversa não pede retorno, responda exatamente: PULAR
- Responda só com o texto da mensagem (ou PULAR), sem aspas nem comentários.
{$knowledgeBlock}
Regras do atendimento da clínica:
{$rules}
PROMPT;
    }

    /**
     * @param  Collection<int, WhatsappMessage>  $messages
     */
    private function transcript(Collection $messages, Connection $connection): string
    {
        $aiName = trim((string) ($connection->ai_display_name ?? ''));
        $lines = [];
        foreach ($messages as $message) {
            $body = $message->textForAgent();
            if ($message->direction === 'outbound' && $aiName !== '') {
                $body = Connection::stripAiDisplayNamePrefix($body, $aiName);
            }
            $body = trim($body);
            if ($body === '') {
                continue;
            }
            $lines[] = ($message->direction === 'outbound' ? 'Clínica: ' : 'Paciente: ').$body;
        }

        return implode("\n", $lines);
    }
}
