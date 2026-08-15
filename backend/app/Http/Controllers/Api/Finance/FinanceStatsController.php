<?php

namespace App\Http\Controllers\Api\Finance;

use App\Http\Controllers\Controller;
use App\Models\Finance\FinancialEntry;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FinanceStatsController extends Controller
{
    /** Alimenta o dashboard inteiro numa chamada só. */
    public function overview(Request $request): JsonResponse
    {
        $dados = $request->validate([
            'meses' => ['sometimes', 'integer', 'min:3', 'max:24'],
        ]);

        $meses = (int) ($dados['meses'] ?? 6);
        $tz = config('app.timezone') ?: 'UTC';
        $hoje = CarbonImmutable::now($tz)->startOfDay();

        return response()->json([
            'kpis' => $this->kpis($hoje),
            'serie' => $this->serie($hoje, $meses, $tz),
            'previsto' => $this->previsto($hoje, $meses),
            'por_conta' => $this->porConta($hoje, $meses),
            'proximos' => $this->proximos($hoje),
        ]);
    }

    /** @return array<string, float> */
    private function kpis(CarbonImmutable $hoje): array
    {
        $abertos = FinancialEntry::query()
            ->pending()
            ->selectRaw('direction, SUM(amount) AS total')
            ->groupBy('direction')
            ->pluck('total', 'direction');

        $vencidos = FinancialEntry::query()
            ->overdue()
            ->selectRaw('direction, SUM(amount) AS total')
            ->groupBy('direction')
            ->pluck('total', 'direction');

        $realizadoMes = FinancialEntry::query()
            ->where('status', 'paid')
            ->whereBetween('paid_at', [$hoje->startOfMonth()->utc(), $hoje->endOfMonth()->utc()])
            ->selectRaw('direction, SUM(COALESCE(paid_amount, amount)) AS total')
            ->groupBy('direction')
            ->pluck('total', 'direction');

        $pagoMes = (float) ($realizadoMes['payable'] ?? 0);
        $recebidoMes = (float) ($realizadoMes['receivable'] ?? 0);

        return [
            'a_pagar_aberto' => (float) ($abertos['payable'] ?? 0),
            'a_receber_aberto' => (float) ($abertos['receivable'] ?? 0),
            'vencidos_pagar' => (float) ($vencidos['payable'] ?? 0),
            'vencidos_receber' => (float) ($vencidos['receivable'] ?? 0),
            'pago_mes' => $pagoMes,
            'recebido_mes' => $recebidoMes,
            'saldo_mes' => round($recebidoMes - $pagoMes, 2),
        ];
    }

    /**
     * Série mensal do realizado (baseada na data da baixa), com meses sem
     * movimento preenchidos com zero.
     *
     * @return array<int, array<string, mixed>>
     */
    private function serie(CarbonImmutable $hoje, int $meses, string $tz): array
    {
        $inicio = $hoje->startOfMonth()->subMonths($meses - 1);

        $linhas = FinancialEntry::query()
            ->where('status', 'paid')
            ->where('paid_at', '>=', $inicio->utc())
            ->get(['direction', 'paid_at', 'paid_amount', 'amount']);

        $totais = [];
        foreach ($linhas as $linha) {
            $mes = $linha->paid_at->timezone($tz)->format('Y-m');
            $valor = (float) ($linha->paid_amount ?? $linha->amount);
            $chave = $linha->direction === 'payable' ? 'pagar' : 'receber';
            $totais[$mes][$chave] = ($totais[$mes][$chave] ?? 0) + $valor;
        }

        $serie = [];
        for ($i = 0; $i < $meses; $i++) {
            $mes = $inicio->addMonths($i)->format('Y-m');
            $serie[] = [
                'month' => $mes,
                'receber' => round((float) ($totais[$mes]['receber'] ?? 0), 2),
                'pagar' => round((float) ($totais[$mes]['pagar'] ?? 0), 2),
            ];
        }

        return $serie;
    }

    /**
     * Série mensal do previsto, olhando para frente: mês atual + os próximos,
     * agrupada pela data de vencimento (ignora cancelados).
     *
     * Complementa `serie()`, que olha para trás e usa a data da baixa.
     *
     * @return array<int, array<string, mixed>>
     */
    private function previsto(CarbonImmutable $hoje, int $meses): array
    {
        $inicio = $hoje->startOfMonth();
        $fim = $inicio->addMonths($meses - 1)->endOfMonth();

        $linhas = FinancialEntry::query()
            ->where('status', '!=', 'canceled')
            ->whereBetween('due_date', [$inicio->toDateString(), $fim->toDateString()])
            ->get(['direction', 'due_date', 'amount']);

        $totais = [];
        foreach ($linhas as $linha) {
            $mes = $linha->due_date->format('Y-m');
            $chave = $linha->direction === 'payable' ? 'pagar' : 'receber';
            $totais[$mes][$chave] = ($totais[$mes][$chave] ?? 0) + (float) $linha->amount;
        }

        $serie = [];
        for ($i = 0; $i < $meses; $i++) {
            $mes = $inicio->addMonths($i)->format('Y-m');
            $serie[] = [
                'month' => $mes,
                'receber' => round((float) ($totais[$mes]['receber'] ?? 0), 2),
                'pagar' => round((float) ($totais[$mes]['pagar'] ?? 0), 2),
            ];
        }

        return $serie;
    }

    /**
     * Realizado por conta do plano de contas no período, maiores primeiro.
     *
     * @return array<int, array<string, mixed>>
     */
    private function porConta(CarbonImmutable $hoje, int $meses): array
    {
        $inicio = $hoje->startOfMonth()->subMonths($meses - 1);

        return FinancialEntry::query()
            ->join('financial_accounts', 'financial_accounts.id', '=', 'financial_entries.account_id')
            ->where('financial_entries.status', 'paid')
            ->where('financial_entries.paid_at', '>=', $inicio->utc())
            ->groupBy('financial_accounts.id', 'financial_accounts.code', 'financial_accounts.name', 'financial_accounts.type')
            ->orderByDesc(DB::raw('SUM(COALESCE(financial_entries.paid_amount, financial_entries.amount))'))
            ->limit(8)
            ->get([
                'financial_accounts.code',
                'financial_accounts.name',
                'financial_accounts.type',
                DB::raw('SUM(COALESCE(financial_entries.paid_amount, financial_entries.amount)) AS total'),
            ])
            ->map(fn ($linha) => [
                'code' => $linha->code,
                'name' => $linha->name,
                'type' => $linha->type,
                'total' => (float) $linha->total,
            ])
            ->all();
    }

    /** Pendentes vencendo nos próximos 7 dias (inclui os já vencidos). */
    private function proximos(CarbonImmutable $hoje): array
    {
        return FinancialEntry::query()
            ->pending()
            ->with(['account', 'contact'])
            ->whereDate('due_date', '<=', $hoje->addDays(7)->toDateString())
            ->orderBy('due_date')
            ->limit(10)
            ->get()
            ->all();
    }
}
