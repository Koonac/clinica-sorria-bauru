<?php

namespace App\Http\Requests\Crm;

use App\Models\Crm\Activity;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreActivityRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'type' => ['required', Rule::in(Activity::TYPES)],
            'subject' => ['nullable', 'string', 'max:190'],
            'body' => ['nullable', 'string'],
            'due_at' => ['nullable', 'date'],
            'done_at' => ['nullable', 'date'],
            'lead_id' => ['nullable', 'integer', 'exists:leads,id', 'required_without_all:deal_id,contact_id'],
            'deal_id' => ['nullable', 'integer', 'exists:deals,id', 'required_without_all:lead_id,contact_id'],
            'contact_id' => ['nullable', 'integer', 'exists:contacts,id', 'required_without_all:lead_id,deal_id'],
            'meta' => ['nullable', 'array'],
        ];
    }

    public function messages(): array
    {
        return [
            'lead_id.required_without_all' => 'Informe ao menos um vínculo: lead, negócio ou contato.',
            'deal_id.required_without_all' => 'Informe ao menos um vínculo: lead, negócio ou contato.',
            'contact_id.required_without_all' => 'Informe ao menos um vínculo: lead, negócio ou contato.',
        ];
    }
}
