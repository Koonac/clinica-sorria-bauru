<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;

class StoreWhatsappCampaignRecipientRequest extends FormRequest
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
            'full_name' => ['sometimes', 'nullable', 'string', 'max:190'],
            'phone' => ['required', 'string', 'max:40'],
            'notes' => ['sometimes', 'nullable', 'string'],
        ];
    }
}
