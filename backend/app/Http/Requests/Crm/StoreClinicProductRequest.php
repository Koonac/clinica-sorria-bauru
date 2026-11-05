<?php

namespace App\Http\Requests\Crm;

use App\Models\Crm\ClinicProduct;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreClinicProductRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:190'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'price' => ['required', 'numeric', 'min:0'],
            'category' => ['required', 'string', Rule::in(ClinicProduct::CATEGORIES)],
            'audience' => ['required', 'string', Rule::in(ClinicProduct::AUDIENCES)],
            'sizes' => ['sometimes', 'array'],
            'sizes.*' => ['string', Rule::in(ClinicProduct::SIZES)],
            'colors' => ['sometimes', 'nullable', 'string', 'max:255'],
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
            'name.required' => 'Informe o nome da peça.',
            'price.required' => 'Informe o preço da peça.',
            'category.in' => 'Categoria inválida.',
            'audience.in' => 'Público inválido. Use feminino, masculino, unissex ou infantil.',
            'sizes.*.in' => 'Tamanho inválido.',
            'image.image' => 'Envie uma imagem válida (jpg, png, webp ou gif).',
            'image.max' => 'A imagem deve ter no máximo 5 MB.',
        ];
    }
}
