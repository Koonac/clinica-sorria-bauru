<?php

namespace App\Services\Auth;

use App\Models\User;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class AssertUserAccessible
{
    public function handle(User $actor, User $target): void
    {
        if ($actor->isDeveloper()) {
            return;
        }

        if ($target->isDeveloper()) {
            throw new AccessDeniedHttpException('Acesso não autorizado a este usuário.');
        }

        if (
            ! $actor->clinic_id
            || (int) $actor->clinic_id !== (int) $target->clinic_id
        ) {
            throw new NotFoundHttpException('Usuário não encontrado.');
        }
    }
}
