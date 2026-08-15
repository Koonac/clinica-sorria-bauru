<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreDealRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:190'],
            'contact_id' => ['required', 'integer', 'exists:contacts,id'],
            'stage_id' => [
                'required',
                'integer',
                Rule::exists('pipeline_stages', 'id')->where('kind', 'deal'),
            ],
            'lead_id' => ['nullable', 'integer', 'exists:leads,id'],
            'organization_id' => ['nullable', 'integer', 'exists:organizations,id'],
            'owner_id' => ['nullable', 'integer', 'exists:users,id'],
            'source_id' => ['nullable', 'integer', 'exists:sources,id'],
            'value' => ['nullable', 'numeric', 'min:0', 'max:9999999999.99'],
            'currency' => ['nullable', 'string', 'size:3'],
            'probability' => ['nullable', 'integer', 'between:0,100'],
            'expected_close_on' => ['nullable', 'date'],
        ];
    }
}
