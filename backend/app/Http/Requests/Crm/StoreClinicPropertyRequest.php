<?php

namespace App\Http\Requests\Crm;

use App\Models\Crm\ClinicProperty;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreClinicPropertyRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user?->isAdmin() === true || $user?->isDeveloper() === true;
    }

    public function rules(): array
    {
        return [
            'title' => ['nullable', 'string', 'max:190'],
            'address' => ['required', 'string', 'max:255'],
            'price' => ['required', 'numeric', 'min:0'],
            'deal_type' => ['required', 'string', Rule::in(ClinicProperty::DEAL_TYPES)],
            'property_type' => ['required', 'string', Rule::in(ClinicProperty::PROPERTY_TYPES)],
            'active' => ['sometimes', 'boolean'],
            'image' => ['sometimes', 'nullable', 'image', 'max:5120'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'address.required' => 'Informe o endereço do imóvel.',
            'price.required' => 'Informe o valor do imóvel.',
            'deal_type.in' => 'Tipo de negócio inválido. Use aluguel ou compra.',
            'property_type.in' => 'Tipo de imóvel inválido.',
            'image.image' => 'Envie uma imagem válida (jpg, png, webp ou gif).',
            'image.max' => 'A imagem deve ter no máximo 5 MB.',
        ];
    }
}
