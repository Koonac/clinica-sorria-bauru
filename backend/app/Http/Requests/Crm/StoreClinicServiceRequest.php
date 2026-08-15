<?php

namespace App\Http\Requests\Crm;

use App\Support\ClinicContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreClinicServiceRequest extends FormRequest
{
    public function rules(): array
    {
        $clinicId = app(ClinicContext::class)->id();

        return [
            'code' => [
                'required',
                'string',
                'max:64',
                Rule::unique('clinic_services', 'code')->where(
                    fn ($query) => $query->where('clinic_id', $clinicId)
                ),
            ],
            'name' => ['required', 'string', 'max:190'],
            'duration_minutes' => ['required', 'integer', 'min:1', 'max:1440'],
            'price_particular_min' => ['required', 'numeric', 'min:0'],
            'price_particular_max' => ['required', 'numeric', 'min:0', 'gte:price_particular_min'],
            'accepts_insurance' => ['sometimes', 'boolean'],
            'description' => ['nullable', 'string'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'price_particular_max.gte' => 'O preço máximo deve ser maior ou igual ao mínimo.',
            'code.unique' => 'Já existe um serviço com este código nesta clínica.',
        ];
    }
}
