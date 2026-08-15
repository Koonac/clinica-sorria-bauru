<?php

namespace App\Services\Crm;

use App\Models\Clinic;
use App\Models\User;
use Illuminate\Support\Collection;

class ListClinics
{
    /**
     * @return Collection<int, Clinic>
     */
    public function handle(?User $user = null, bool $onlyActive = false): Collection
    {
        $query = Clinic::query()->orderBy('name');

        if ($onlyActive) {
            $query->where('is_active', true);
        }

        if ($user?->isFuncionario()) {
            if (! $user->clinic_id) {
                return collect();
            }
            $query->whereKey($user->clinic_id);
        }

        return $query->get();
    }
}
