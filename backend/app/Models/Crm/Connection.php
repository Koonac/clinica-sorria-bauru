<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use App\Models\User;
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
        ];
    }

    public function resolvedAgentHistoryLimit(): int
    {
        $limit = (int) ($this->whatsapp_agent_history_limit ?? 40);

        return max(5, min(100, $limit > 0 ? $limit : 40));
    }
}
