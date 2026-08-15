<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;

class MarkWhatsappChatReadRequest extends FormRequest
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
            'lead_id' => ['nullable', 'integer', 'exists:leads,id'],
        ];
    }
}
