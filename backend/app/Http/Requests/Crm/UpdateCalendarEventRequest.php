<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateCalendarEventRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'summary' => ['sometimes', 'string', 'max:500'],
            'start' => ['sometimes', 'string', 'max:64'],
            'end' => ['sometimes', 'string', 'max:64'],
            'all_day' => ['sometimes', 'boolean'],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'location' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $hasStart = $this->exists('start');
            $hasEnd = $this->exists('end');
            if ($hasStart !== $hasEnd) {
                $validator->errors()->add(
                    $hasStart ? 'end' : 'start',
                    'Ao alterar horário, envie start e end juntos.',
                );
            }
        });
    }
}
