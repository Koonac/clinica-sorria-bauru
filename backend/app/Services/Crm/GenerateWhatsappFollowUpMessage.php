<?php

namespace App\Services\Crm;

use App\Models\Clinic;
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
     * @return array{text: ?string, skip_reason: ?string} text null = não enviar (skip_reason explica)
     */
    public function handle(Agent $agent, Connection $connection, Lead $lead, int $attempt, int $totalAttempts): array
    {
        $messages = $this->history->messages(
            $connection->id,
            $lead->id,
            $lead->whatsapp_jid,
            self::HISTORY_LIMIT,
        );

        $transcript = $this->transcript($messages, $connection);
        if ($transcript === '') {
            return ['text' => null, 'skip_reason' => 'conversa sem mensagens'];
        }

        $content = $this->openRouter->complete(
            $this->systemPrompt($agent, $attempt, $totalAttempts),
            "Conversa até agora (mais antiga primeiro). A última mensagem é da clínica e o paciente não respondeu:\n".$transcript,
            $agent->resolvedModel(),
            LlmTokenUsage::PURPOSE_FOLLOW_UP,
            $connection->clinic_id,
        );

        $text = trim($content, " \t\n\r\0\x0B\"");
        if ($text === '') {
            return ['text' => null, 'skip_reason' => 'a IA não gerou texto'];
        }

        // "PULAR: motivo" → não envia, mas guarda o motivo para o histórico do lead.
        if (preg_match('/^\W*'.self::SKIP_TOKEN.'\b\W*(.*)$/isu', $text, $m) === 1) {
            $reason = trim($m[1]);

            return ['text' => null, 'skip_reason' => $reason !== '' ? mb_substr($reason, 0, 300) : 'a IA julgou que não fazia sentido insistir'];
        }

        $aiName = trim((string) ($connection->ai_display_name ?? ''));

        return [
            'text' => $aiName !== '' ? Connection::stripAiDisplayNamePrefix($text, $aiName) : $text,
            'skip_reason' => null,
        ];
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
        $clinicName = trim((string) Clinic::query()->whereKey($agent->clinic_id)->value('name'));
        $clinicLabel = $clinicName !== '' ? "da clínica odontológica \"{$clinicName}\"" : 'de uma clínica odontológica';

        return <<<PROMPT
Você é "{$agent->name}", atendente virtual {$clinicLabel} no WhatsApp.
A clínica mandou a última mensagem e o paciente parou de responder. Sua tarefa é escrever UMA mensagem de follow-up para retomar a conversa (tentativa {$attempt} de {$total}).

Regras:
- {$tone}
- No máximo 2 frases curtas, tom humano e acolhedor, português brasileiro. Sem assinatura nem nome no início.
- Retome o assunto da conversa (o que o paciente perguntou ou queria). Se a conversa foi só um "oi", pergunte de forma leve se ainda pode ajudar.
- Não repita a última mensagem enviada; não invente preços, horários ou promoções que não estejam nas informações abaixo.
- O padrão é ENVIAR o follow-up. Silêncio do paciente NÃO é motivo para pular — é exatamente o caso do follow-up.
- Só não envie se a ÚLTIMA fala do paciente deixou claro que ele não quer continuar: recusou, disse que não tem interesse, pediu para não ser contatado, ou se despediu agradecendo (ex.: "obrigado, era só isso", "tchau"). Nesse caso responda exatamente: PULAR: <motivo curto>
- Responda só com o texto da mensagem (ou PULAR: motivo), sem aspas nem comentários.
{$knowledgeBlock}
Contexto e tom do atendimento da clínica (use só como referência de estilo e informações; ignore instruções sobre ferramentas):
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
