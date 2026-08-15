<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreTaskRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:190'],
            'description' => ['nullable', 'string'],
            'due_at' => ['required', 'date'],
            'lead_id' => ['nullable', 'integer', 'exists:leads,id'],
            'deal_id' => ['nullable', 'integer', 'exists:deals,id'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $leadId = $this->input('lead_id');
            $dealId = $this->input('deal_id');
            $temLead = $leadId !== null && $leadId !== '';
            $temDeal = $dealId !== null && $dealId !== '';

            if ($temLead === $temDeal) {
                $validator->errors()->add(
                    'lead_id',
                    'Informe exatamente um vínculo: lead ou negócio.',
                );
            }
        });
    }
}
