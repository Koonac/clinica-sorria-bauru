<?php

namespace App\Services\Crm;

use App\Models\Crm\CrmNotification;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class MarkCrmNotificationsRead
{
    /**
     * Marca como lidas para o usuário. Sem ids = todas as não lidas da clínica.
     *
     * @param  list<int>|null  $ids
     */
    public function handle(User $user, ?array $ids = null): int
    {
        $query = CrmNotification::query()
            ->whereDoesntHave('readers', fn ($q) => $q->where('users.id', $user->id));

        if ($ids !== null) {
            $query->whereIn('id', $ids);
        }

        $pending = $query->pluck('id');
        if ($pending->isEmpty()) {
            return 0;
        }

        $now = now();
        DB::table('crm_notification_reads')->insertOrIgnore(
            $pending->map(fn ($id) => [
                'crm_notification_id' => (int) $id,
                'user_id' => $user->id,
                'read_at' => $now,
            ])->all()
        );

        return $pending->count();
    }
}
