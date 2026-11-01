<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;

class StoreCalendarEventRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'summary' => ['required', 'string', 'max:500'],
            'start' => ['required', 'string', 'max:64'],
            'end' => ['required', 'string', 'max:64'],
            'all_day' => ['sometimes', 'boolean'],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'location' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'summary.required' => 'Título do evento é obrigatório.',
            'start.required' => 'Início do evento é obrigatório.',
            'end.required' => 'Fim do evento é obrigatório.',
        ];
    }
}
