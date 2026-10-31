<?php

namespace App\Http\Requests\Crm;

use App\Http\Requests\Crm\Concerns\ValidatesAgentWorkingHours;
use Illuminate\Foundation\Http\FormRequest;

class StoreAgentRequest extends FormRequest
{
    use ValidatesAgentWorkingHours;

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'system_prompt' => ['nullable', 'string'],
            'debounce_seconds' => ['nullable', 'integer', 'min:3', 'max:60'],
            'is_active' => ['sometimes', 'boolean'],
            ...$this->workingHoursRules(),
        ];
    }
}
