<?php

namespace App\Http\Requests\Finance;

use Illuminate\Foundation\Http\FormRequest;

class UpdateFinancialEntryRequest extends FormRequest
{
    /**
     * `direction` e `status` ficam de fora de propósito: a direção é imutável e a
     * baixa/estorno tem endpoint próprio (`/entries/{entry}/settle`).
     */
    public function rules(): array
    {
        return [
            'description' => ['sometimes', 'string', 'max:190'],
            'amount' => ['sometimes', 'numeric', 'min:0.01', 'max:9999999999.99'],
            'due_date' => ['sometimes', 'date'],
            'payment_method' => ['sometimes', 'nullable', 'string', 'max:30'],
            'document' => ['sometimes', 'nullable', 'string', 'max:60'],
            'party_name' => ['sometimes', 'nullable', 'string', 'max:190'],
            'notes' => ['sometimes', 'nullable', 'string'],
            'account_id' => ['sometimes', 'nullable', 'integer', 'exists:financial_accounts,id'],
            'contact_id' => ['sometimes', 'nullable', 'integer', 'exists:contacts,id'],
            'deal_id' => ['sometimes', 'nullable', 'integer', 'exists:deals,id'],
        ];
    }
}
