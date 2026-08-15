<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ConvertLeadRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'title' => ['nullable', 'string', 'max:190'],
            'stage_id' => [
                'nullable',
                'integer',
                Rule::exists('pipeline_stages', 'id')->where('kind', 'deal'),
            ],
            'value' => ['nullable', 'numeric', 'min:0', 'max:9999999999.99'],
            'owner_id' => ['nullable', 'integer', 'exists:users,id'],
        ];
    }
}
