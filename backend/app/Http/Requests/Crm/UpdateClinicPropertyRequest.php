<?php

namespace App\Http\Requests\Crm;

use App\Models\Crm\ClinicProperty;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateClinicPropertyRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user?->isAdmin() === true || $user?->isDeveloper() === true;
    }

    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'nullable', 'string', 'max:190'],
            'address' => ['sometimes', 'string', 'max:255'],
            'price' => ['sometimes', 'numeric', 'min:0'],
            'deal_type' => ['sometimes', 'string', Rule::in(ClinicProperty::DEAL_TYPES)],
            'property_type' => ['sometimes', 'string', Rule::in(ClinicProperty::PROPERTY_TYPES)],
            'active' => ['sometimes', 'boolean'],
            'image' => ['sometimes', 'nullable', 'image', 'max:5120'],
            'remove_image' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'deal_type.in' => 'Tipo de negócio inválido. Use aluguel ou compra.',
            'property_type.in' => 'Tipo de imóvel inválido.',
            'image.image' => 'Envie uma imagem válida (jpg, png, webp ou gif).',
            'image.max' => 'A imagem deve ter no máximo 5 MB.',
        ];
    }
}
