<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Agent extends Model
{
    use BelongsToClinic;

    protected $fillable = [
        'clinic_id',
        'user_id',
        'name',
        'system_prompt',
        'debounce_seconds',
        'is_active',
        'working_hours',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'debounce_seconds' => 'integer',
            'working_hours' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeForUser(Builder $query, int $userId): Builder
    {
        return $query->where('user_id', $userId);
    }

    public static function activeFor(User $user): ?self
    {
        return static::query()
            ->forUser($user->id)
            ->active()
            ->first();
    }

    public static function activeForClinic(int $clinicId): ?self
    {
        return static::withoutGlobalScopes()
            ->where('clinic_id', $clinicId)
            ->active()
            ->first();
    }

    public function resolvedModel(): string
    {
        return (string) config('services.openrouter.agent_model', 'deepseek/deepseek-v4-pro');
    }

    public function canActivate(): bool
    {
        return trim((string) ($this->system_prompt ?? '')) !== '';
    }

    /**
     * Sem working_hours o agent atende 24h. Período com fim antes do início vira a madrugada
     * (qui 18:00–08:00 vale até sex 08:00).
     */
    public function isWorkingAt(?CarbonInterface $at = null): bool
    {
        if (! is_array($this->working_hours)) {
            return true;
        }

        $at = ($at ?? now())->copy()->timezone(config('app.timezone'));
        $time = $at->format('H:i');

        $today = $this->working_hours[$at->dayOfWeekIso] ?? null;
        if (is_array($today)) {
            $sameDay = $today['start'] < $today['end'];
            if ($time >= $today['start'] && (! $sameDay || $time < $today['end'])) {
                return true;
            }
        }

        $yesterday = $this->working_hours[$at->dayOfWeekIso === 1 ? 7 : $at->dayOfWeekIso - 1] ?? null;

        return is_array($yesterday)
            && $yesterday['start'] >= $yesterday['end']
            && $time < $yesterday['end'];
    }

    /**
     * Próximo início de período depois de $from (null = sem nenhum dia configurado).
     */
    public function nextWorkingOpening(?CarbonInterface $from = null): ?CarbonInterface
    {
        if (! is_array($this->working_hours)) {
            return null;
        }

        $from = ($from ?? now())->copy()->timezone(config('app.timezone'));
        for ($offset = 0; $offset <= 7; $offset++) {
            $day = $from->copy()->addDays($offset);
            $range = $this->working_hours[$day->dayOfWeekIso] ?? null;
            if (! is_array($range)) {
                continue;
            }

            [$hour, $minute] = array_map('intval', explode(':', $range['start']));
            $opening = $day->copy()->setTime($hour, $minute);
            if ($opening->greaterThan($from)) {
                return $opening;
            }
        }

        return null;
    }
}
