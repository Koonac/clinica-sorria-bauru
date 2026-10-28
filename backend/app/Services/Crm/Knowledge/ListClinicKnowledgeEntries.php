<?php

namespace App\Services\Crm\Knowledge;

use App\Models\Crm\ClinicKnowledgeEntry;
use Illuminate\Support\Collection;

class ListClinicKnowledgeEntries
{
    /**
     * @param  array{category?: string|null, active?: bool|null}  $filters
     * @return Collection<int, ClinicKnowledgeEntry>
     */
    public function handle(array $filters = []): Collection
    {
        // Categorias aposentadas (ex.: "horarios", agora em Horário de atendimento) ficam fora da tela.
        $query = ClinicKnowledgeEntry::query()
            ->whereIn('category', ClinicKnowledgeEntry::CATEGORIES)
            ->orderBy('category')
            ->orderBy('position')
            ->orderBy('id');

        if (filled($filters['category'] ?? null)) {
            $query->where('category', $filters['category']);
        }
        if (array_key_exists('active', $filters) && $filters['active'] !== null) {
            $query->where('active', (bool) $filters['active']);
        }

        return $query->get();
    }
}
