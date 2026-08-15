<?php

namespace App\Services\Finance;

use App\Models\Finance\FinancialEntry;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CreateFinancialEntry
{
    /**
     * Cria o lançamento. Com `installments` > 1, gera N parcelas mensais
     * agrupadas por `installment_group`, dividindo o valor em centavos
     * (o resíduo vai para a última parcela, então a soma fecha exata).
     *
     * @param  array<string, mixed>  $dados
     * @return Collection<int, FinancialEntry>
     */
    public function handle(array $dados): Collection
    {
        $parcelas = (int) ($dados['installments'] ?? 1);
        unset($dados['installments']);

        if ($parcelas <= 1) {
            return collect([FinancialEntry::create($dados)]);
        }

        return DB::transaction(function () use ($dados, $parcelas) {
            $grupo = (string) Str::uuid();
            $vencimento = CarbonImmutable::parse($dados['due_date']);

            $centavosTotais = (int) round(((float) $dados['amount']) * 100);
            $centavosParcela = intdiv($centavosTotais, $parcelas);
            $residuo = $centavosTotais - ($centavosParcela * $parcelas);

            $criadas = collect();

            for ($i = 0; $i < $parcelas; $i++) {
                $centavos = $centavosParcela + ($i === $parcelas - 1 ? $residuo : 0);

                $criadas->push(FinancialEntry::create([
                    ...$dados,
                    'amount' => $centavos / 100,
                    'due_date' => $vencimento->addMonthsNoOverflow($i)->toDateString(),
                    'installment_group' => $grupo,
                    'installment_number' => $i + 1,
                    'installment_total' => $parcelas,
                ]));
            }

            return $criadas;
        });
    }
}
