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

    /** @var list<string> */
    public const EDITABLE_KEYS = [
        self::KEY_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT,
        self::KEY_OPENROUTER_TRANSCRIPTION_MODEL,
        self::KEY_OPENROUTER_TRANSCRIPTION_LANGUAGE,
        self::KEY_OPENROUTER_VISION_MODEL,
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
            self::KEY_OPENROUTER_TRANSCRIPTION_MODEL => (string) config('services.openrouter.transcription_model', 'openai/whisper-1'),
            self::KEY_OPENROUTER_TRANSCRIPTION_LANGUAGE => (string) config('services.openrouter.transcription_language', 'pt'),
            self::KEY_OPENROUTER_VISION_MODEL => (string) config('services.openrouter.vision_model', 'openai/gpt-4o-mini'),
            default => null,
        };
    }
}
