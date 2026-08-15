<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Services\Crm\ClinicaCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClinicaController extends Controller
{
    public function __construct(private ClinicaCatalog $catalog) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->catalog->search($request->query())]);
    }

    public function show(string $clinica): JsonResponse
    {
        $found = $this->catalog->find($clinica);
        if (! $found) {
            return response()->json(['message' => 'Clínica não encontrada.'], 404);
        }

        return response()->json([
            'data' => [
                'ok' => true,
                'mock' => false,
                'clinica' => $found,
            ],
        ]);
    }
}
