<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;

class GenerateWhatsappCampaignMessagesRequest extends FormRequest
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
            'system_prompt' => ['required', 'string'],
            'model' => ['required', 'string', 'max:190'],
        ];
    }
}
