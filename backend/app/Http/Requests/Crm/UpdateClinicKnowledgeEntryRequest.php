<?php

namespace App\Http\Requests\Crm;

use App\Models\Crm\ClinicKnowledgeEntry;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateClinicKnowledgeEntryRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'category' => ['sometimes', Rule::in(ClinicKnowledgeEntry::CATEGORIES)],
            'title' => ['sometimes', 'nullable', 'string', 'max:190'],
            'content' => ['sometimes', 'string', 'max:4000'],
            'position' => ['sometimes', 'integer', 'min:0'],
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
        ];
    }
}
