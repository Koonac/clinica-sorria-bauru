<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Validation\ValidationException;

class DeleteUser
{
    public function __construct(private AssertUserAccessible $assertAccessible) {}

    public function handle(User $actor, User $user): void
    {
        if ($actor->is($user)) {
            throw ValidationException::withMessages([
                'user' => 'Você não pode excluir a própria conta.',
            ]);
        }

        $this->assertAccessible->handle($actor, $user);

        if ($user->role === User::ROLE_ADMIN && $this->ehUltimoAdminDaClinica($user)) {
            throw ValidationException::withMessages([
                'user' => 'Não é possível excluir o último administrador desta clínica.',
            ]);
        }

        $user->tokens()->delete();
        $user->delete();
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
