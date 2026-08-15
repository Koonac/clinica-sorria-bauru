<?php

namespace App\Models\Crm;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Agent extends Model
{
    protected $fillable = [
        'user_id',
        'name',
        'system_prompt',
        'model',
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

    public function resolvedModel(): string
    {
        $model = trim((string) ($this->model ?? ''));
        if ($model !== '') {
            return $model;
        }

        return (string) config('services.openrouter.agent_model', 'openai/gpt-4o-mini');
    }

    public function canActivate(): bool
    {
        return trim((string) ($this->system_prompt ?? '')) !== '';
    }
}
