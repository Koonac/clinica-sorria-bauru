<?php

namespace App\Services\Crm\Knowledge;

use App\Models\Crm\ClinicKnowledgeEntry;

class CreateClinicKnowledgeEntry
{
    /**
     * @param  array{category: string, title?: string|null, content: string, position?: int|null, active?: bool}  $attrs
     */
    public function handle(array $attrs): ClinicKnowledgeEntry
    {
        if (! array_key_exists('position', $attrs) || $attrs['position'] === null) {
            $attrs['position'] = (int) ClinicKnowledgeEntry::query()
                ->where('category', $attrs['category'])
                ->max('position') + 1;
        }
        $attrs['active'] = (bool) ($attrs['active'] ?? true);

        return ClinicKnowledgeEntry::create($attrs);
    }
}
