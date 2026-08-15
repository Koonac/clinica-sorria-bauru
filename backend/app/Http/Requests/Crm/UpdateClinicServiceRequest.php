<?php

namespace App\Http\Requests\Crm;

use App\Models\Crm\ClinicService;
use App\Support\ClinicContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateClinicServiceRequest extends FormRequest
{
    public function rules(): array
    {
        $clinicId = app(ClinicContext::class)->id();
        /** @var ClinicService|null $service */
        $service = $this->route('service');

        return [
            'code' => [
                'sometimes',
                'string',
                'max:64',
                Rule::unique('clinic_services', 'code')
                    ->where(fn ($query) => $query->where('clinic_id', $clinicId))
                    ->ignore($service?->id),
            ],
            'name' => ['sometimes', 'string', 'max:190'],
            'duration_minutes' => ['sometimes', 'integer', 'min:1', 'max:1440'],
            'price_particular_min' => ['sometimes', 'numeric', 'min:0'],
            'price_particular_max' => ['sometimes', 'numeric', 'min:0'],
            'accepts_insurance' => ['sometimes', 'boolean'],
            'description' => ['sometimes', 'nullable', 'string'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            /** @var ClinicService|null $service */
            $service = $this->route('service');
            $min = $this->input('price_particular_min', $service?->price_particular_min);
            $max = $this->input('price_particular_max', $service?->price_particular_max);

            if ($min !== null && $max !== null && (float) $max < (float) $min) {
                $validator->errors()->add(
                    'price_particular_max',
                    'O preço máximo deve ser maior ou igual ao mínimo.'
                );
            }
        });
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'code.unique' => 'Já existe um serviço com este código nesta clínica.',
        ];
    }
}
