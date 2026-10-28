<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;
use Throwable;

class Connection extends Model
{
    use BelongsToClinic;

    public const STATUSES = [
        'disconnected',
        'connecting',
        'connected',
        'error',
    ];

    public const SCHEDULING_DIRECT = 'direct';

    public const SCHEDULING_PRE_BOOKING = 'pre_booking';

    public const SCHEDULING_MODES = [self::SCHEDULING_DIRECT, self::SCHEDULING_PRE_BOOKING];

    /** 2h, 24h e 3 dias sem resposta. */
    public const DEFAULT_FOLLOW_UP_DELAYS = [120, 1440, 4320];

    public const DEFAULT_REMINDER_TEMPLATE = 'Olá, {nome}! Passando para lembrar da sua consulta {quando}, às {hora}, na {clinica}. Você confirma sua presença? Se precisar remarcar, é só responder aqui.';

    protected $fillable = [
        'clinic_id',
        'name',
        'ai_display_name',
        'api_username',
        'api_password',
        'session_id',
        'webhook_token',
        'status',
        'phone',
        'qr',
        'is_business',
        'default_lead_stage_id',
        'whatsapp_agent_auto_resume_hours',
        'whatsapp_attendance_auto_close_minutes',
        'whatsapp_finalize_notice',
        'whatsapp_agent_history_limit',
        'reception_alert_jid',
        'scheduling_mode',
        'appointment_reminder_enabled',
        'appointment_reminder_hours',
        'appointment_reminder_template',
        'whatsapp_follow_up_enabled',
        'whatsapp_follow_up_delays',
        'whatsapp_send_window_start',
        'whatsapp_send_window_end',
        'created_by',
    ];

    protected $hidden = [
        'api_password',
        'webhook_token',
        'qr',
    ];

    protected function casts(): array
    {
        return [
            'is_business' => 'boolean',
            'appointment_reminder_enabled' => 'boolean',
            'appointment_reminder_hours' => 'integer',
            'whatsapp_follow_up_enabled' => 'boolean',
            'whatsapp_follow_up_delays' => 'array',
            'whatsapp_send_window_start' => 'integer',
            'whatsapp_send_window_end' => 'integer',
        ];
    }

    /**
     * Senhas migradas em texto puro (insert via Query Builder) quebram o cast
     * `encrypted` no save — o dirty-check tenta descriptografar o valor antigo.
     */
    protected function apiPassword(): Attribute
    {
        return Attribute::make(
            get: function (?string $value): ?string {
                if (! filled($value)) {
                    return $value;
                }

                try {
                    return Crypt::decrypt($value, false);
                } catch (Throwable) {
                    return $value;
                }
            },
            set: function (?string $value): ?string {
                if (! filled($value)) {
                    return $value;
                }

                try {
                    return Crypt::encrypt($value, false);
                } catch (Throwable) {
                    return $value;
                }
            },
        );
    }

    public function hasCredentials(): bool
    {
        return filled($this->api_username) && filled($this->api_password);
    }

    public function defaultLeadStage(): BelongsTo
    {
        return $this->belongsTo(PipelineStage::class, 'default_lead_stage_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Prefixa o nome de exibição da IA no corpo outbound (WhatsApp),
     * removendo assinaturas duplicadas que o modelo possa ter incluído.
     */
    public function applyAiDisplayNamePrefix(string $texto): string
    {
        $aiName = trim((string) ($this->ai_display_name ?? ''));
        if ($aiName === '') {
            return $texto;
        }

        $texto = self::stripAiDisplayNamePrefix($texto, $aiName);

        return '*_'.$aiName."_*\n\n".$texto;
    }

    /**
     * Remove assinatura do nome da IA no início do texto (plain ou markdown WhatsApp).
     */
    public static function stripAiDisplayNamePrefix(string $texto, string $aiName): string
    {
        $aiName = trim($aiName);
        if ($aiName === '') {
            return ltrim($texto);
        }

        $quoted = preg_quote($aiName, '/');
        $pattern = '/^(?:\*_'.$quoted.'_\*|\*\*'.$quoted.'\*\*|\*'.$quoted.'\*|_'.$quoted.'_|'.$quoted.')\s*(?:\n+|$)/iu';

        $previous = null;
        while ($previous !== $texto && preg_match($pattern, $texto) === 1) {
            $previous = $texto;
            $texto = (string) preg_replace($pattern, '', $texto, 1);
        }

        return ltrim($texto);
    }

    /**
     * @return array<string, mixed>
     */
    public function toPublicArray(): array
    {
        return [
            'id' => $this->id,
            'clinic_id' => $this->clinic_id,
            'name' => $this->name,
            'ai_display_name' => $this->ai_display_name,
            'status' => $this->status,
            'phone' => $this->phone,
            'is_business' => (bool) $this->is_business,
            'has_credentials' => $this->hasCredentials(),
            'session_id' => $this->session_id,
            'default_lead_stage_id' => $this->default_lead_stage_id,
            'whatsapp_agent_auto_resume_hours' => (int) ($this->whatsapp_agent_auto_resume_hours ?? 24),
            'whatsapp_attendance_auto_close_minutes' => (int) ($this->whatsapp_attendance_auto_close_minutes ?? 10),
            'whatsapp_finalize_notice' => (string) ($this->whatsapp_finalize_notice ?? '_finalizando chamado_'),
            'whatsapp_agent_history_limit' => $this->resolvedAgentHistoryLimit(),
            'reception_alert_jid' => $this->reception_alert_jid,
            'scheduling_mode' => $this->resolvedSchedulingMode(),
            'appointment_reminder_enabled' => (bool) ($this->appointment_reminder_enabled ?? true),
            'appointment_reminder_hours' => $this->resolvedReminderHours(),
            'appointment_reminder_template' => $this->resolvedReminderTemplate(),
            'whatsapp_follow_up_enabled' => (bool) ($this->whatsapp_follow_up_enabled ?? false),
            'whatsapp_follow_up_delays' => $this->resolvedFollowUpDelays(),
            'whatsapp_send_window_start' => $this->resolvedSendWindow()[0],
            'whatsapp_send_window_end' => $this->resolvedSendWindow()[1],
        ];
    }

    public function resolvedSchedulingMode(): string
    {
        return in_array($this->scheduling_mode, self::SCHEDULING_MODES, true)
            ? (string) $this->scheduling_mode
            : self::SCHEDULING_DIRECT;
    }

    public function isPreBookingMode(): bool
    {
        return $this->resolvedSchedulingMode() === self::SCHEDULING_PRE_BOOKING;
    }

    public function resolvedReminderHours(): int
    {
        $hours = (int) ($this->appointment_reminder_hours ?? 24);

        return max(2, min(72, $hours > 0 ? $hours : 24));
    }

    public function resolvedReminderTemplate(): string
    {
        $template = trim((string) ($this->appointment_reminder_template ?? ''));

        return $template !== '' ? $template : self::DEFAULT_REMINDER_TEMPLATE;
    }

    /**
     * Atrasos (minutos) de cada tentativa de follow-up, contados a partir da mensagem anterior.
     *
     * @return list<int>
     */
    public function resolvedFollowUpDelays(): array
    {
        $delays = is_array($this->whatsapp_follow_up_delays) ? $this->whatsapp_follow_up_delays : [];
        $delays = array_values(array_filter(
            array_map(fn ($d) => (int) $d, $delays),
            fn (int $d) => $d >= 1,
        ));

        $delays = array_map(fn (int $d) => min($d, 60 * 24 * 30), array_slice($delays, 0, 5));

        return $delays !== [] ? $delays : self::DEFAULT_FOLLOW_UP_DELAYS;
    }

    /**
     * Janela [início, fim) em horas locais para mensagens automáticas (follow-up, lembrete).
     *
     * @return array{0: int, 1: int}
     */
    public function resolvedSendWindow(): array
    {
        $start = max(0, min(23, (int) ($this->whatsapp_send_window_start ?? 8)));
        $end = max(1, min(24, (int) ($this->whatsapp_send_window_end ?? 20)));

        return $end > $start ? [$start, $end] : [8, 20];
    }

    public function isWithinSendWindow(?CarbonInterface $at = null): bool
    {
        $at = ($at ?? now())->copy()->timezone(config('app.timezone'));
        [$start, $end] = $this->resolvedSendWindow();

        return $at->hour >= $start && $at->hour < $end;
    }

    /**
     * Próximo instante dentro da janela de envio (o próprio $at se já estiver nela).
     */
    public function nextSendWindowOpening(?CarbonInterface $at = null): CarbonInterface
    {
        $at = ($at ?? now())->copy()->timezone(config('app.timezone'));
        if ($this->isWithinSendWindow($at)) {
            return $at;
        }

        [$start] = $this->resolvedSendWindow();
        $opening = $at->copy()->setTime($start, 0);

        return $opening->lessThanOrEqualTo($at) ? $opening->addDay() : $opening;
    }

    public function resolvedAgentHistoryLimit(): int
    {
        $limit = (int) ($this->whatsapp_agent_history_limit ?? 40);

        return max(5, min(100, $limit > 0 ? $limit : 40));
    }
}
