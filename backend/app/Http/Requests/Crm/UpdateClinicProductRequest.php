<?php

namespace App\Http\Requests\Crm;

use App\Models\Crm\ClinicProduct;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateClinicProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user?->isAdmin() === true || $user?->isDeveloper() === true;
    }

    protected function prepareForValidation(): void
    {
        // FormData não envia array vazio: o front manda sizes="" para "nenhum tamanho".
        if ($this->has('sizes') && ($this->input('sizes') === '' || $this->input('sizes') === null)) {
            $this->merge(['sizes' => []]);
        }
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'price' => ['sometimes', 'numeric', 'min:0'],
            'category' => ['sometimes', 'string', Rule::in(ClinicProduct::CATEGORIES)],
            'audience' => ['sometimes', 'string', Rule::in(ClinicProduct::AUDIENCES)],
            'sizes' => ['sometimes', 'array'],
            'sizes.*' => ['string', Rule::in(ClinicProduct::SIZES)],
            'colors' => ['sometimes', 'nullable', 'string', 'max:255'],
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
            'category.in' => 'Categoria inválida.',
            'audience.in' => 'Público inválido. Use feminino, masculino, unissex ou infantil.',
            'sizes.*.in' => 'Tamanho inválido.',
            'image.image' => 'Envie uma imagem válida (jpg, png, webp ou gif).',
            'image.max' => 'A imagem deve ter no máximo 5 MB.',
        ];
    }
}
