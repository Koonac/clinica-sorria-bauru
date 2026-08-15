<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;

class UpdateWhatsappCredentialsRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'whatsapp_api_username' => ['required', 'string', 'max:190'],
            'whatsapp_api_password' => ['required', 'string', 'max:500'],
        ];
    }
}
