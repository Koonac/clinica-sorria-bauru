<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateDealRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'string', 'max:190'],
            'contact_id' => ['sometimes', 'integer', 'exists:contacts,id'],
            'stage_id' => [
                'sometimes',
                'integer',
                Rule::exists('pipeline_stages', 'id')->where('kind', 'deal'),
            ],
            'organization_id' => ['sometimes', 'nullable', 'integer', 'exists:organizations,id'],
            'owner_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'source_id' => ['sometimes', 'nullable', 'integer', 'exists:sources,id'],
            'value' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:9999999999.99'],
            'currency' => ['sometimes', 'string', 'size:3'],
            'probability' => ['sometimes', 'nullable', 'integer', 'between:0,100'],
            'expected_close_on' => ['sometimes', 'nullable', 'date'],
            'lost_reason' => ['sometimes', 'nullable', 'string', 'max:190'],
            'lost_notes' => ['sometimes', 'nullable', 'string'],
        ];
    }
}
