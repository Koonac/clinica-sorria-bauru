<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class MoveLeadRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'stage_id' => [
                'required',
                'integer',
                Rule::exists('pipeline_stages', 'id')->where('kind', 'lead'),
            ],
            'lost_reason' => ['nullable', 'string', 'max:190'],
        ];
    }
}
