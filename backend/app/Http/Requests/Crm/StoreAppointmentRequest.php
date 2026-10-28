<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;

class StoreAppointmentRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'lead_id' => ['required', 'integer', 'exists:leads,id'],
            'title' => ['required', 'string', 'max:190'],
            'starts_at' => ['required', 'date', 'after:now'],
            'ends_at' => ['required', 'date', 'after:starts_at'],
            'clinic_service_id' => ['sometimes', 'nullable', 'integer', 'exists:clinic_services,id'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'notify_patient' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'starts_at.after' => 'Escolha um horário no futuro.',
            'ends_at.after' => 'O fim deve ser depois do início.',
        ];
    }
}
