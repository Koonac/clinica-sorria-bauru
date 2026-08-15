<?php

namespace App\Http\Requests\Finance;

use Illuminate\Foundation\Http\FormRequest;

class SettleFinancialEntryRequest extends FormRequest
{
    /** Baixa do lançamento (pagamento/recebimento). Campos ausentes usam o default do controller. */
    public function rules(): array
    {
        return [
            'paid_at' => ['nullable', 'date'],
            'paid_amount' => ['nullable', 'numeric', 'min:0', 'max:9999999999.99'],
            'payment_method' => ['nullable', 'string', 'max:30'],
        ];
    }
}
