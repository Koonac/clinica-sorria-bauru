<?php

namespace App\Services\Crm;

use App\Models\Crm\CrmNotification;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class ListCrmNotifications
{
    /**
     * @param  array{unread?: bool, limit?: int|null}  $filters
     * @return array{data: list<array<string, mixed>>, meta: array{unread_count: int}}
     */
    public function handle(User $user, array $filters = []): array
    {
        $limit = max(1, min(100, (int) ($filters['limit'] ?? 30)));

        $unreadQuery = CrmNotification::query()
            ->whereDoesntHave('readers', fn (Builder $q) => $q->where('users.id', $user->id));

        $query = ! empty($filters['unread']) ? clone $unreadQuery : CrmNotification::query();

        $items = $query
            ->with(['lead:id,name,mobile', 'readers' => fn ($q) => $q->where('users.id', $user->id)])
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(fn (CrmNotification $n) => [
                'id' => $n->id,
                'type' => $n->type,
                'priority' => $n->priority,
                'title' => $n->title,
                'body' => $n->body,
                'lead_id' => $n->lead_id,
                'lead_name' => $n->lead?->name,
                'appointment_id' => $n->appointment_id,
                'data' => $n->data,
                'read_at' => $n->readers->first()?->pivot?->read_at,
                'created_at' => $n->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        return [
            'data' => $items,
            'meta' => ['unread_count' => $unreadQuery->count()],
        ];
    }
}
