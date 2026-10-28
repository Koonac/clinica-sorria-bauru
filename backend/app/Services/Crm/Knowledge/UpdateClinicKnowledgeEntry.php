<?php

namespace App\Services\Crm\Knowledge;

use App\Models\Crm\ClinicKnowledgeEntry;

class UpdateClinicKnowledgeEntry
{
    /**
     * @param  array<string, mixed>  $attrs
     */
    public function handle(ClinicKnowledgeEntry $entry, array $attrs): ClinicKnowledgeEntry
    {
        $entry->update($attrs);

        return $entry->fresh() ?? $entry;
    }
}
