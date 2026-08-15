<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Services\Crm\ImovelCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ImovelController extends Controller
{
    public function __construct(private ImovelCatalog $catalog) {}

    public function index(Request $request): JsonResponse
    {
        $result = $this->catalog->search($request->query());

        return response()->json(['data' => $result]);
    }

    public function show(string $imovel): JsonResponse
    {
        $found = $this->catalog->find($imovel);
        if (! $found) {
            return response()->json(['message' => 'Imóvel não encontrado.'], 404);
        }

        return response()->json([
            'data' => [
                'ok' => true,
                'mock' => true,
                'imovel' => $found,
            ],
        ]);
    }
}
