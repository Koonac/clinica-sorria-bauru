<?php

namespace App\Http\Controllers\Api\Finance;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\SettleFinancialEntryRequest;
use App\Http\Requests\Finance\StoreFinancialEntryRequest;
use App\Http\Requests\Finance\UpdateFinancialEntryRequest;
use App\Models\Finance\FinancialEntry;
use App\Services\Finance\CreateFinancialEntry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FinancialEntryController extends Controller
{
    private const RELACOES = ['account', 'contact', 'deal'];

    public function index(Request $request): JsonResponse
    {
        $query = FinancialEntry::query()
            ->with(self::RELACOES)
            ->orderBy('due_date')
            ->orderBy('id');

        if ($direction = $request->query('direction')) {
            $query->ofDirection($direction);
        }

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        if ($accountId = $request->query('account_id')) {
            $query->where('account_id', $accountId);
        }

        if ($contactId = $request->query('contact_id')) {
            $query->where('contact_id', $contactId);
        }

        if ($de = $request->query('due_from')) {
            $query->whereDate('due_date', '>=', $de);
        }

        if ($ate = $request->query('due_to')) {
            $query->whereDate('due_date', '<=', $ate);
        }

        if ($request->boolean('overdue')) {
            $query->overdue();
        }

        if ($search = trim((string) $request->query('search'))) {
            $like = '%'.$search.'%';
            $query->where(fn ($q) => $q
                ->whereLike('description', $like, caseSensitive: false)
                ->orWhereLike('party_name', $like, caseSensitive: false)
                ->orWhereLike('document', $like, caseSensitive: false));
        }

        return response()->json($query->paginate(50));
    }

    public function store(StoreFinancialEntryRequest $request, CreateFinancialEntry $criador): JsonResponse
    {
        $entradas = $criador->handle($request->validated());

        return response()->json(['data' => $entradas->map->load(self::RELACOES)->values()], 201);
    }

    public function show(FinancialEntry $entry): JsonResponse
    {
        return response()->json(['data' => $entry->load(self::RELACOES)]);
    }

    public function update(UpdateFinancialEntryRequest $request, FinancialEntry $entry): JsonResponse
    {
        $entry->update($request->validated());

        return response()->json(['data' => $entry->fresh(self::RELACOES)]);
    }

    public function destroy(FinancialEntry $entry): JsonResponse
    {
        $id = $entry->id;
        $entry->delete();

        return response()->json(['data' => ['id' => $id]]);
    }

    /** Baixa: marca como pago/recebido. Sem `paid_amount`, assume o valor cheio. */
    public function settle(SettleFinancialEntryRequest $request, FinancialEntry $entry): JsonResponse
    {
        $dados = $request->validated();

        if ($entry->status === 'canceled') {
            return response()->json(['message' => 'Lançamento cancelado não pode receber baixa.'], 422);
        }

        $entry->update([
            'status' => 'paid',
            'paid_at' => $dados['paid_at'] ?? now(),
            'paid_amount' => $dados['paid_amount'] ?? $entry->amount,
            'payment_method' => $dados['payment_method'] ?? $entry->payment_method,
        ]);

        return response()->json(['data' => $entry->fresh(self::RELACOES)]);
    }

    /** Estorno da baixa: volta para pendente. */
    public function unsettle(FinancialEntry $entry): JsonResponse
    {
        $entry->update([
            'status' => 'pending',
            'paid_at' => null,
            'paid_amount' => null,
        ]);

        return response()->json(['data' => $entry->fresh(self::RELACOES)]);
    }
}
