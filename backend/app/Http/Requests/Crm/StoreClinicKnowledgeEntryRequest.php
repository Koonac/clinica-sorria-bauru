<?php

namespace App\Http\Requests\Crm;

use App\Models\Crm\ClinicKnowledgeEntry;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreClinicKnowledgeEntryRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'category' => ['required', Rule::in(ClinicKnowledgeEntry::CATEGORIES)],
            'title' => ['nullable', 'string', 'max:190'],
            'content' => ['required', 'string', 'max:4000'],
            'position' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'active' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'category.in' => 'Categoria inválida.',
            'content.required' => 'Informe o conteúdo da resposta.',
        ];
    }
}
