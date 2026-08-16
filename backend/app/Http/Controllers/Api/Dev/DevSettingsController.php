<?php

namespace App\Http\Controllers\Api\Dev;

use App\Http\Controllers\Controller;
use App\Http\Requests\Dev\UpdateSystemSettingsRequest;
use App\Services\Crm\OpenRouterModelCatalog;
use App\Services\Dev\GetSystemSettings;
use App\Services\Dev\UpdateSystemSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class DevSettingsController extends Controller
{
    public function show(GetSystemSettings $getter): JsonResponse
    {
        return response()->json([
            'data' => $getter->handle(),
        ]);
    }

    public function update(UpdateSystemSettingsRequest $request, UpdateSystemSettings $updater): JsonResponse
    {
        return response()->json([
            'data' => $updater->handle($request->validated()),
        ]);
    }

    public function openrouterModels(Request $request, OpenRouterModelCatalog $catalog): JsonResponse
    {
        $capability = (string) $request->query('capability', OpenRouterModelCatalog::CAPABILITY_TEXT);

        if (! in_array($capability, OpenRouterModelCatalog::CAPABILITIES, true)) {
            return response()->json([
                'message' => 'Capacidade inválida. Use: '.implode(', ', OpenRouterModelCatalog::CAPABILITIES).'.',
            ], 422);
        }

        try {
            $models = $catalog->handle($capability);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'data' => [
                'models' => $models,
                'total' => count($models),
                'capability' => $capability,
            ],
        ]);
    }
}
