<?php

namespace App\Services\Crm;

use App\Models\Crm\Task;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Carbon;

class ListTasks
{
    /**
     * @param  array{
     *   lead_id?: int|string|null,
     *   deal_id?: int|string|null,
     *   pending?: bool,
     *   due_from?: string|null,
     *   due_to?: string|null,
     * }  $filters
     * @return Collection<int, Task>
     */
    public function handle(array $filters = []): Collection
    {
        $query = Task::query()
            ->with([
                'user:id,name',
                'lead:id,name',
                'deal:id,title',
            ])
            ->orderedByDue();

        if (! empty($filters['lead_id'])) {
            $query->where('lead_id', (int) $filters['lead_id']);
        }

        if (! empty($filters['deal_id'])) {
            $query->where('deal_id', (int) $filters['deal_id']);
        }

        if (! empty($filters['pending'])) {
            $query->pending();
        }

        if (! empty($filters['due_from'])) {
            $query->where('due_at', '>=', Carbon::parse($filters['due_from'])->startOfDay());
        }

        if (! empty($filters['due_to'])) {
            $query->where('due_at', '<=', Carbon::parse($filters['due_to'])->endOfDay());
        }

        return $query->get();
    }
}
