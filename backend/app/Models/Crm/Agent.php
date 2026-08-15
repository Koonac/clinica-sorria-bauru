<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use App\Models\User;
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
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'debounce_seconds' => 'integer',
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
        return (string) config('services.openrouter.agent_model', 'deepseek/deepseek-v4-flash-0731');
    }

    public function canActivate(): bool
    {
        return trim((string) ($this->system_prompt ?? '')) !== '';
    }
}
