<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Services\Crm\FaixaPrecoCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FaixaPrecoController extends Controller
{
    public function __construct(private FaixaPrecoCatalog $catalog) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->catalog->search($request->query())]);
    }

    public function show(string $faixa): JsonResponse
    {
        $found = $this->catalog->find($faixa);
        if (! $found) {
            return response()->json(['message' => 'Faixa de preço não encontrada.'], 404);
        }

        return response()->json([
            'data' => [
                'ok' => true,
                'mock' => true,
                'faixa' => $found,
            ],
        ]);
    }
}
