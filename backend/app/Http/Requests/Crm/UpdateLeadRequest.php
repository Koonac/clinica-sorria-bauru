<?php

namespace App\Http\Requests\Crm;

use App\Models\Crm\Lead;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateLeadRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'string', 'max:190'],
            // 'converted' só via POST /leads/{id}/convert.
            'status' => ['sometimes', Rule::in(array_diff(Lead::STATUSES, ['converted']))],
            'name' => ['sometimes', 'string', 'max:190'],
            'email' => ['sometimes', 'nullable', 'email', 'max:190'],
            'mobile' => ['sometimes', 'nullable', 'string', 'max:40'],
            'whatsapp_jid' => ['sometimes', 'nullable', 'string', 'max:80'],
            'instagram' => ['sometimes', 'nullable', 'string', 'max:120'],
            'organization_name' => ['sometimes', 'nullable', 'string', 'max:190'],
            'contact_id' => ['sometimes', 'nullable', 'integer', 'exists:contacts,id'],
            'organization_id' => ['sometimes', 'nullable', 'integer', 'exists:organizations,id'],
            'owner_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'source_id' => ['sometimes', 'nullable', 'integer', 'exists:sources,id'],
            'value' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:9999999999.99'],
            'currency' => ['sometimes', 'nullable', 'string', 'size:3'],
            'external_id' => ['sometimes', 'nullable', 'string', 'max:120'],
            'lost_reason' => ['sometimes', 'nullable', 'string', 'max:190'],
        ];
    }
}
