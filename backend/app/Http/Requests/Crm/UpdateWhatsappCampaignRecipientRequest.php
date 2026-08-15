<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;

class UpdateWhatsappCampaignRecipientRequest extends FormRequest
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
            'use_custom_message' => ['sometimes', 'boolean'],
            'custom_message' => ['sometimes'],
            'full_name' => ['sometimes', 'nullable', 'string', 'max:190'],
            'notes' => ['sometimes', 'nullable', 'string'],
        ];
    }
}
