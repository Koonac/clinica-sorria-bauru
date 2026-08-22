<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Validation\ValidationException;

class UpdateUser
{
    public function __construct(private AssertUserAccessible $assertAccessible) {}

    /**
     * @param  array{
     *   name?: string,
     *   username?: string,
     *   email?: string,
     *   password?: string,
     *   role?: string,
     *   clinic_id?: int|null,
     * }  $attrs
     */
    public function handle(User $actor, User $user, array $attrs): User
    {
        $this->assertAccessible->handle($actor, $user);

        if (
            isset($attrs['role'])
            && $attrs['role'] !== User::ROLE_ADMIN
            && $user->role === User::ROLE_ADMIN
        ) {
            if ($this->ehUltimoAdminDaClinica($user)) {
                throw ValidationException::withMessages([
                    'role' => 'Não é possível remover o papel de admin do último administrador desta clínica.',
                ]);
            }
        }

        $user->fill($attrs)->save();

        return $user->fresh();
    }

    private function ehUltimoAdminDaClinica(User $user): bool
    {
        $query = User::query()
            ->where('role', User::ROLE_ADMIN)
            ->whereKeyNot($user->id);

        if ($user->clinic_id) {
            $query->where('clinic_id', $user->clinic_id);
        } else {
            $query->whereNull('clinic_id');
        }

        return $query->doesntExist();
    }
}
