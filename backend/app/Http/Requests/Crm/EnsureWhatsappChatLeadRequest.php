<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;

class EnsureWhatsappChatLeadRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'jid' => ['required', 'string', 'max:120'],
            'phone_number' => ['nullable', 'string', 'max:40'],
            'contact_name' => ['nullable', 'string', 'max:255'],
        ];
    }
}
