<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;

class StoreWhatsappCampaignRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:190'],
            'delay_between_contacts_sec' => ['sometimes', 'integer', 'min:0', 'max:3600'],
            'delay_jitter_sec' => ['sometimes', 'integer', 'min:0', 'max:600'],
            'messages' => ['required', 'array', 'min:1'],
            'messages.*.message_body' => ['required', 'string'],
            'messages.*.delay_after_sec' => ['sometimes', 'integer', 'min:0', 'max:3600'],
        ];
    }
}
