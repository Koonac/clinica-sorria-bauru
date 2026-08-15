<?php

namespace App\Models\Finance;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FinancialAccount extends Model
{
    public const TYPES = ['receita', 'despesa'];

    protected $fillable = [
        'code',
        'name',
        'type',
        'parent_id',
        'position',
        'active',
    ];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'position' => 'integer',
        ];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('position')->orderBy('code');
    }

    public function entries(): HasMany
    {
        return $this->hasMany(FinancialEntry::class, 'account_id');
    }

    public function scopeOfType(Builder $query, string $type): Builder
    {
        return $query->where('type', $type);
    }

    /**
     * IDs de todos os descendentes (usado para barrar ciclo na árvore).
     *
     * @return array<int, int>
     */
    public function descendantIds(): array
    {
        $ids = [];
        $fila = [$this->id];

        while ($fila !== []) {
            $filhos = self::query()->whereIn('parent_id', $fila)->pluck('id')->all();
            if ($filhos === []) {
                break;
            }
            $ids = array_merge($ids, $filhos);
            $fila = $filhos;
        }

        return $ids;
    }
}
