<?php

namespace App\Http\Requests\Finance;

use App\Models\Finance\FinancialEntry;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreFinancialEntryRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'direction' => ['required', Rule::in(FinancialEntry::DIRECTIONS)],
            'description' => ['required', 'string', 'max:190'],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:9999999999.99'],
            'due_date' => ['required', 'date'],
            'payment_method' => ['nullable', 'string', 'max:30'],
            'document' => ['nullable', 'string', 'max:60'],
            'party_name' => ['nullable', 'string', 'max:190'],
            'notes' => ['nullable', 'string'],
            'account_id' => ['nullable', 'integer', 'exists:financial_accounts,id'],
            'contact_id' => ['nullable', 'integer', 'exists:contacts,id'],
            'deal_id' => ['nullable', 'integer', 'exists:deals,id'],
            // Nº de parcelas: 1 (ou ausente) cria um único lançamento.
            'installments' => ['nullable', 'integer', 'min:1', 'max:60'],
        ];
    }
}
