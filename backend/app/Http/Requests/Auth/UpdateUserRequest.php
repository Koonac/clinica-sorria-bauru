<?php

namespace App\Http\Requests\Auth;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isAdmin() === true;
    }

    public function rules(): array
    {
        /** @var User $user */
        $user = $this->route('user');

        return [
            'name' => ['sometimes', 'string', 'max:190'],
            'username' => [
                'sometimes',
                'string',
                'max:64',
                'alpha_dash:ascii',
                Rule::unique('users', 'username')->ignore($user->id),
            ],
            'email' => [
                'sometimes',
                'email',
                'max:190',
                Rule::unique('users', 'email')->ignore($user->id),
            ],
            'password' => ['sometimes', 'string', Password::defaults()],
            'role' => ['sometimes', Rule::in(User::ROLES)],
        ];
    }
}
