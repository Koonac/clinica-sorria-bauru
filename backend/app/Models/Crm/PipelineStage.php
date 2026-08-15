<?php

namespace App\Models\Crm;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PipelineStage extends Model
{
    public const KINDS = ['lead', 'deal'];

    /** Status analítico exclusivo do estágio. */
    public const STATUSES = ['open', 'in_progress', 'won', 'lost'];

    protected $fillable = [
        'kind',
        'slug',
        'name',
        'color',
        'position',
        'is_open',
        'is_in_progress',
        'is_won',
        'is_lost',
        'active',
    ];

    protected function casts(): array
    {
        return [
            'is_open' => 'boolean',
            'is_in_progress' => 'boolean',
            'is_won' => 'boolean',
            'is_lost' => 'boolean',
            'active' => 'boolean',
        ];
    }

    public function scopeOfKind(Builder $query, string $kind): Builder
    {
        return $query->where('kind', $kind);
    }

    public function deals(): HasMany
    {
        return $this->hasMany(Deal::class, 'stage_id');
    }

    public function leads(): HasMany
    {
        return $this->hasMany(Lead::class, 'stage_id');
    }

    public function isTerminal(): bool
    {
        return $this->is_won || $this->is_lost;
    }

    /** @return 'open'|'in_progress'|'won'|'lost' */
    public function status(): string
    {
        if ($this->is_won) {
            return 'won';
        }
        if ($this->is_lost) {
            return 'lost';
        }
        if ($this->is_in_progress) {
            return 'in_progress';
        }

        return 'open';
    }

    /**
     * Define as flags de forma exclusiva a partir de um status.
     *
     * @param  'open'|'in_progress'|'won'|'lost'  $status
     * @return array{is_open: bool, is_in_progress: bool, is_won: bool, is_lost: bool}
     */
    public static function flagsFor(string $status): array
    {
        return [
            'is_open' => $status === 'open',
            'is_in_progress' => $status === 'in_progress',
            'is_won' => $status === 'won',
            'is_lost' => $status === 'lost',
        ];
    }

    /**
     * Normaliza flags recebidas: no máximo uma true; default open.
     *
     * @param  array{is_open?: bool, is_in_progress?: bool, is_won?: bool, is_lost?: bool}  $flags
     * @return array{is_open: bool, is_in_progress: bool, is_won: bool, is_lost: bool}
     */
    public static function normalizeFlags(array $flags): array
    {
        if (! empty($flags['is_won'])) {
            return self::flagsFor('won');
        }
        if (! empty($flags['is_lost'])) {
            return self::flagsFor('lost');
        }
        if (! empty($flags['is_in_progress'])) {
            return self::flagsFor('in_progress');
        }
        if (! empty($flags['is_open'])) {
            return self::flagsFor('open');
        }

        return self::flagsFor('open');
    }
}
