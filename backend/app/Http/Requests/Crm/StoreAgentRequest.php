<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;

class StoreAgentRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'system_prompt' => ['nullable', 'string'],
            'model' => ['nullable', 'string', 'max:255'],
            'debounce_seconds' => ['nullable', 'integer', 'min:3', 'max:60'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
