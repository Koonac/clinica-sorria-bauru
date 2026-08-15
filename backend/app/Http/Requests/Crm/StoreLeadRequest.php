<?php

namespace App\Http\Requests\Crm;

use App\Models\Crm\Lead;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreLeadRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'title' => ['nullable', 'string', 'max:190'],
            'status' => ['nullable', Rule::in(array_diff(Lead::STATUSES, ['converted']))],
            'name' => ['required', 'string', 'max:190'],
            'email' => ['nullable', 'email', 'max:190'],
            'mobile' => ['nullable', 'string', 'max:40'],
            'whatsapp_jid' => ['nullable', 'string', 'max:80'],
            'instagram' => ['nullable', 'string', 'max:120'],
            'organization_name' => ['nullable', 'string', 'max:190'],
            'contact_id' => ['nullable', 'integer', 'exists:contacts,id'],
            'organization_id' => ['nullable', 'integer', 'exists:organizations,id'],
            'owner_id' => ['nullable', 'integer', 'exists:users,id'],
            'source_id' => ['nullable', 'integer', 'exists:sources,id'],
            'value' => ['nullable', 'numeric', 'min:0', 'max:9999999999.99'],
            'currency' => ['nullable', 'string', 'size:3'],
            'external_id' => ['nullable', 'string', 'max:120'],
            'stage_id' => [
                'nullable',
                'integer',
                Rule::exists('pipeline_stages', 'id')->where('kind', 'lead'),
            ],
        ];
    }
}
