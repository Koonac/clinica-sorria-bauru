<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;

class UpdateAgentRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:255'],
            'system_prompt' => ['sometimes', 'nullable', 'string'],
            'model' => ['sometimes', 'nullable', 'string', 'max:255'],
            'debounce_seconds' => ['sometimes', 'integer', 'min:3', 'max:60'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
