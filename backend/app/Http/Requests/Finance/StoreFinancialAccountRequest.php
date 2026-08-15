<?php

namespace App\Http\Requests\Finance;

use App\Models\Finance\FinancialAccount;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreFinancialAccountRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'code' => ['required', 'string', 'max:30', Rule::unique('financial_accounts', 'code')],
            'name' => ['required', 'string', 'max:190'],
            'type' => ['required', Rule::in(FinancialAccount::TYPES)],
            'parent_id' => ['nullable', 'integer', 'exists:financial_accounts,id'],
            'position' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'active' => ['nullable', 'boolean'],
        ];
    }
}
