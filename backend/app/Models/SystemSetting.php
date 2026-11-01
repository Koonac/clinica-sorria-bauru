<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SystemSetting extends Model
{
    public const KEY_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT = 'ai_attendance_summary_system_prompt';

    public const DEFAULT_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT = <<<'PROMPT'
Você resume atendimentos WhatsApp de uma clínica odontológica.
Escreva em português brasileiro, em 3 a 6 bullets factuais curtos.
Inclua: motivo do contato, o que foi feito/combinado e pendências (se houver).
Não invente fatos. Não mencione tools, CRM, transferindo/finalizando chamado nem IDs internos.
PROMPT;

    public const KEY_OPENROUTER_TRANSCRIPTION_MODEL = 'openrouter_transcription_model';

    public const KEY_OPENROUTER_TRANSCRIPTION_LANGUAGE = 'openrouter_transcription_language';

    public const KEY_OPENROUTER_VISION_MODEL = 'openrouter_vision_model';

    public const KEY_OPENROUTER_VISION_SYSTEM_PROMPT = 'openrouter_vision_system_prompt';

    public const KEY_OPENROUTER_VISION_INSTRUCTION = 'openrouter_vision_instruction';

    public const DEFAULT_OPENROUTER_VISION_SYSTEM_PROMPT = 'Você descreve imagens recebidas por WhatsApp em uma clínica odontológica. Responda em português, em no máximo 3 frases objetivas, focando no que é relevante para o atendimento (o que aparece, textos legíveis, região da boca/dente, documentos, exames). Não faça diagnóstico nem suposições sobre o paciente.';

    public const DEFAULT_OPENROUTER_VISION_INSTRUCTION = 'Descreva esta imagem enviada pelo paciente.';

    public const KEY_WHATSAPP_MEDIA_RETENTION_DAYS = 'whatsapp_media_retention_days';

    public const KEY_WHATSAPP_MEDIA_MAX_MB_PER_CLINIC = 'whatsapp_media_max_mb_per_clinic';

    public const KEY_WHATSAPP_AGENT_SYSTEM_PROMPT = 'whatsapp_agent_system_prompt';

    public const DEFAULT_WHATSAPP_AGENT_SYSTEM_PROMPT = <<<'PROMPT'
Você é o agent de atendimento WhatsApp "{agent_name}"{clinic_intro}.

Regras de operação (obrigatórias):
- Fale com o lead SOMENTE pela tool enviar_resposta. Texto livre / comentários NÃO são enviados ao WhatsApp.
- enviar_resposta deve conter apenas mensagem natural ao cliente (tom humano). Proibido: resumo interno, status de CRM, "mensagem enviada", "aguardar resposta do lead", "o lead já está no estágio…", checklists de qualificação, narrar tools usadas.
- Não inclua seu nome, assinatura ou prefixo no início da mensagem — o sistema adiciona automaticamente.
- Depois de mover_lead / criar_agendamento / escalar_humano / finalizar_atendimento, se precisar avisar o cliente, chame enviar_resposta com uma confirmação curta e humana — não mande relatório operacional.
- Quando o lead informar um dado da lista "Informações a descobrir", chame armazenar_info_lead imediatamente (não só mencione no chat).
- Use as tools para agir; não invente stage_id fora da lista abaixo.
- Antes de oferecer horários ao lead, chame listar_horarios_disponiveis e ofereça só o que ela retornar (sem inventar).
- Nunca cite nome, título ou descrição de outros compromissos da agenda — só horários livres.
- Antes de confirmar procedimentos, preços ou cobertura por convênio, chame consultar_servicos e use apenas o retorno. A clínica já é a deste atendimento.
{scheduling_rules}
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
- {lead_block}
- Estágios de lead disponíveis: {stages_json}
- Fuso horário: {timezone}
- Agora: {now}
{calendar_block}
{appointments_block}{prior_summaries}{signals_block}{knowledge_block}{qualification_block}
Regras do agent (system prompt do cliente):
{agent_rules}
PROMPT;

    /** @var list<string> */
    public const EDITABLE_KEYS = [
        self::KEY_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT,
        self::KEY_WHATSAPP_AGENT_SYSTEM_PROMPT,
        self::KEY_OPENROUTER_TRANSCRIPTION_MODEL,
        self::KEY_OPENROUTER_TRANSCRIPTION_LANGUAGE,
        self::KEY_OPENROUTER_VISION_MODEL,
        self::KEY_OPENROUTER_VISION_SYSTEM_PROMPT,
        self::KEY_OPENROUTER_VISION_INSTRUCTION,
        self::KEY_WHATSAPP_MEDIA_RETENTION_DAYS,
        self::KEY_WHATSAPP_MEDIA_MAX_MB_PER_CLINIC,
    ];

    protected $fillable = [
        'key',
        'value',
    ];

    public static function getValue(string $key, ?string $default = null): ?string
    {
        $value = static::query()->where('key', $key)->value('value');

        if ($value === null || trim((string) $value) === '') {
            return $default;
        }

        return (string) $value;
    }

    /**
     * Valor efetivo: o que estiver salvo no banco ou, na falta, o default
     * (constante do código ou `.env` via `config`).
     */
    public static function resolve(string $key): ?string
    {
        return static::getValue($key, static::defaultValue($key));
    }

    public static function defaultValue(string $key): ?string
    {
        return match ($key) {
            self::KEY_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT => self::DEFAULT_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT,
            self::KEY_WHATSAPP_AGENT_SYSTEM_PROMPT => self::DEFAULT_WHATSAPP_AGENT_SYSTEM_PROMPT,
            self::KEY_OPENROUTER_TRANSCRIPTION_MODEL => (string) config('services.openrouter.transcription_model', 'openai/whisper-1'),
            self::KEY_OPENROUTER_TRANSCRIPTION_LANGUAGE => (string) config('services.openrouter.transcription_language', 'pt'),
            self::KEY_OPENROUTER_VISION_MODEL => (string) config('services.openrouter.vision_model', 'openai/gpt-4o-mini'),
            self::KEY_OPENROUTER_VISION_SYSTEM_PROMPT => self::DEFAULT_OPENROUTER_VISION_SYSTEM_PROMPT,
            self::KEY_OPENROUTER_VISION_INSTRUCTION => self::DEFAULT_OPENROUTER_VISION_INSTRUCTION,
            self::KEY_WHATSAPP_MEDIA_RETENTION_DAYS => (string) config('services.whatsapp.media_retention_days', 90),
            self::KEY_WHATSAPP_MEDIA_MAX_MB_PER_CLINIC => (string) config('services.whatsapp.media_max_mb_per_clinic', 2048),
            default => null,
        };
    }
}
