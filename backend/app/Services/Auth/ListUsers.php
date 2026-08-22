<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\Request;

class ListUsers
{
    /**
     * @return LengthAwarePaginator<int, array{id: int, name: string, username: string, email: string, role: string, clinic_id: int|null}>
     */
    public function handle(Request $request, User $actor): LengthAwarePaginator
    {
        $query = User::query()->orderBy('name');

        if ($actor->isClinicScoped()) {
            if (! $actor->clinic_id) {
                $query->whereRaw('1 = 0');
            } else {
                $query
                    ->where('clinic_id', $actor->clinic_id)
                    ->where('role', '!=', User::ROLE_DEVELOPER);
            }
        }

        if ($role = $request->query('role')) {
            $query->where('role', $role);
        }

        if ($search = trim((string) $request->query('search'))) {
            $like = '%'.$search.'%';
            $query->where(function ($q) use ($like) {
                $q->whereLike('name', $like, caseSensitive: false)
                    ->orWhereLike('username', $like, caseSensitive: false)
                    ->orWhereLike('email', $like, caseSensitive: false);
            });
        }

        return $query->paginate(50)->through(fn (User $user) => $user->toAuthArray());
    }
}
