<?php

namespace App\Http\Requests\Crm;

use App\Http\Requests\Crm\Concerns\ValidatesAgentWorkingHours;
use Illuminate\Foundation\Http\FormRequest;

class UpdateAgentRequest extends FormRequest
{
    use ValidatesAgentWorkingHours;

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:255'],
            'system_prompt' => ['sometimes', 'nullable', 'string'],
            'debounce_seconds' => ['sometimes', 'integer', 'min:3', 'max:60'],
            'is_active' => ['sometimes', 'boolean'],
            ...$this->workingHoursRules(),
        ];
    }
}
