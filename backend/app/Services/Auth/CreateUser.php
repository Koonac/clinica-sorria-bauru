<?php

namespace App\Services\Auth;

use App\Models\User;

class CreateUser
{
    /**
     * @param  array{
     *   name: string,
     *   username: string,
     *   email: string,
     *   password: string,
     *   role: string,
     *   clinic_id: int,
     * }  $attrs
     */
    public function handle(array $attrs): User
    {
        return User::query()->create($attrs);
    }
}
