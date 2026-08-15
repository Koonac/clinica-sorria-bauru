<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;

class UpdateTaskRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string'],
            'due_at' => ['sometimes', 'date'],
            // true = concluir agora; false = reabrir; null explícito também reabre.
            'done' => ['sometimes', 'boolean'],
            'done_at' => ['sometimes', 'nullable', 'date'],
        ];
    }
}
