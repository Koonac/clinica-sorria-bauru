<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateConnectionCredentialsRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'api_username' => ['required', 'string', 'max:190'],
            'api_password' => ['required', 'string', 'max:500'],
        ];
    }
}
