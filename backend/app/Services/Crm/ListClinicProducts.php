<?php

namespace App\Services\Crm;

use App\Models\Crm\ClinicProduct;
use Illuminate\Support\Collection;

class ListClinicProducts
{
    /**
     * @param  array{q?: string|null, category?: string|null, audience?: string|null, active?: bool|null}  $filters
     * @return Collection<int, ClinicProduct>
     */
    public function handle(array $filters = []): Collection
    {
        $query = ClinicProduct::query()
            ->orderBy('name')
            ->orderBy('id');

        $q = trim((string) ($filters['q'] ?? ''));
        if ($q !== '') {
            $like = '%'.mb_strtolower($q).'%';
            $query->where(function ($builder) use ($like) {
                $builder->whereRaw('LOWER(name) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(COALESCE(description, \'\')) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(COALESCE(colors, \'\')) LIKE ?', [$like]);
            });
        }

        if (filled($filters['category'] ?? null)) {
            $query->where('category', $filters['category']);
        }
        if (filled($filters['audience'] ?? null)) {
            $query->where('audience', $filters['audience']);
        }
        if (array_key_exists('active', $filters) && $filters['active'] !== null) {
            $query->where('active', (bool) $filters['active']);
        }

        return $query->get();
    }
}
