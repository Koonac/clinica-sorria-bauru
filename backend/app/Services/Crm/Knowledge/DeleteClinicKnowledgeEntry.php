<?php

namespace App\Services\Crm\Knowledge;

use App\Models\Crm\ClinicKnowledgeEntry;

class DeleteClinicKnowledgeEntry
{
    public function handle(ClinicKnowledgeEntry $entry): int
    {
        $id = (int) $entry->id;
        $entry->delete();

        return $id;
    }
}
