<?php

namespace App\Http\Requests\Finance;

use App\Models\Finance\FinancialAccount;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpdateFinancialAccountRequest extends FormRequest
{
    public function rules(): array
    {
        $conta = $this->route('account');

        return [
            'code' => [
                'sometimes',
                'string',
                'max:30',
                Rule::unique('financial_accounts', 'code')->ignore($conta?->id),
            ],
            'name' => ['sometimes', 'string', 'max:190'],
            'type' => ['sometimes', Rule::in(FinancialAccount::TYPES)],
            'parent_id' => ['sometimes', 'nullable', 'integer', 'exists:financial_accounts,id'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:9999'],
            'active' => ['sometimes', 'boolean'],
        ];
    }

    /** A nova conta pai não pode ser a própria conta nem um descendente dela (ciclo). */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $conta = $this->route('account');
            $novoPai = $this->input('parent_id');

            if (! $conta instanceof FinancialAccount || $novoPai === null || $novoPai === '') {
                return;
            }

            $novoPai = (int) $novoPai;
            $proibidos = array_merge([$conta->id], $conta->descendantIds());

            if (in_array($novoPai, $proibidos, true)) {
                $validator->errors()->add(
                    'parent_id',
                    'A conta pai não pode ser a própria conta nem uma subconta dela.',
                );
            }
        });
    }
}
