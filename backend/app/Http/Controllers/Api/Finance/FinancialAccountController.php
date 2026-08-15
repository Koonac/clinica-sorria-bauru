<?php

namespace App\Http\Controllers\Api\Finance;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\StoreFinancialAccountRequest;
use App\Http\Requests\Finance\UpdateFinancialAccountRequest;
use App\Models\Finance\FinancialAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class FinancialAccountController extends Controller
{
    /** `?tree=1` devolve a árvore aninhada; senão, lista plana ordenada por código. */
    public function index(Request $request): JsonResponse
    {
        $query = FinancialAccount::query()->orderBy('position')->orderBy('code');

        if ($type = $request->query('type')) {
            $query->ofType($type);
        }

        if ($request->boolean('active')) {
            $query->where('active', true);
        }

        $contas = $query->get();

        if ($request->boolean('tree')) {
            return response()->json(['data' => $this->montarArvore($contas)]);
        }

        return response()->json(['data' => $contas]);
    }

    public function store(StoreFinancialAccountRequest $request): JsonResponse
    {
        $conta = FinancialAccount::create($request->validated());

        return response()->json(['data' => $conta], 201);
    }

    public function update(UpdateFinancialAccountRequest $request, FinancialAccount $account): JsonResponse
    {
        $account->update($request->validated());

        return response()->json(['data' => $account->fresh()]);
    }

    public function destroy(FinancialAccount $account): JsonResponse
    {
        if ($account->children()->exists()) {
            return response()->json([
                'message' => 'Esta conta tem subcontas. Exclua ou mova as subcontas antes.',
            ], 422);
        }

        if ($account->entries()->exists()) {
            return response()->json([
                'message' => 'Esta conta tem lançamentos vinculados e não pode ser excluída.',
            ], 422);
        }

        $id = $account->id;
        $account->delete();

        return response()->json(['data' => ['id' => $id]]);
    }

    /**
     * Aninha a lista plana em árvore. Contas cujo pai foi filtrado fora
     * (ex.: `?type=`) sobem para a raiz, para não sumirem da resposta.
     *
     * @param  Collection<int, FinancialAccount>  $contas
     * @return array<int, array<string, mixed>>
     */
    private function montarArvore(Collection $contas): array
    {
        $porPai = $contas->groupBy(fn (FinancialAccount $c) => $c->parent_id ?? 0);
        $ids = $contas->pluck('id')->all();

        $montar = function (int $paiId) use (&$montar, $porPai): array {
            return $porPai->get($paiId, collect())
                ->map(fn (FinancialAccount $conta) => [
                    ...$conta->toArray(),
                    'children' => $montar($conta->id),
                ])
                ->values()
                ->all();
        };

        $raizes = $montar(0);

        foreach ($porPai as $paiId => $filhos) {
            if ($paiId === 0 || in_array((int) $paiId, $ids, true)) {
                continue;
            }
            foreach ($filhos as $orfa) {
                $raizes[] = [...$orfa->toArray(), 'children' => $montar($orfa->id)];
            }
        }

        return $raizes;
    }
}
