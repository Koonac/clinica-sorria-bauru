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
            'attendance_status' => ['sometimes', Rule::in(Lead::ATTENDANCE_STATUSES)],
            'qualification_data' => [
                'sometimes',
                'array',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (! is_array($value)) {
                        return;
                    }
                    foreach (array_keys($value) as $key) {
                        if (! preg_match('/^[a-z][a-z0-9_]{1,39}$/', (string) $key)) {
                            $fail('Chave de qualificação inválida.');

                            return;
                        }
                    }
                },
            ],
            'qualification_data.*' => ['nullable', 'string', 'max:500'],
        ];
    }
}
