<?php

namespace App\Services\Crm;

use App\Models\Crm\ClinicProperty;
use Illuminate\Support\Collection;

class ListClinicProperties
{
    /**
     * @param  array{q?: string|null, deal_type?: string|null, property_type?: string|null, active?: bool|null}  $filters
     * @return Collection<int, ClinicProperty>
     */
    public function handle(array $filters = []): Collection
    {
        $query = ClinicProperty::query()
            ->orderByRaw('CASE WHEN title IS NULL OR title = \'\' THEN 1 ELSE 0 END')
            ->orderBy('title')
            ->orderBy('id');

        $q = trim((string) ($filters['q'] ?? ''));
        if ($q !== '') {
            $like = '%'.mb_strtolower($q).'%';
            $query->where(function ($builder) use ($like) {
                $builder->whereRaw('LOWER(COALESCE(title, \'\')) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(address) LIKE ?', [$like]);
            });
        }

        if (filled($filters['deal_type'] ?? null)) {
            $query->where('deal_type', $filters['deal_type']);
        }
        if (filled($filters['property_type'] ?? null)) {
            $query->where('property_type', $filters['property_type']);
        }
        if (array_key_exists('active', $filters) && $filters['active'] !== null) {
            $query->where('active', (bool) $filters['active']);
        }

        return $query->get();
    }
}
