<?php

namespace App\Http\Controllers\Api\Dev;

use App\Http\Controllers\Controller;
use App\Services\Dev\GetLlmTokenUsageStats;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DevTokenController extends Controller
{
    public function stats(Request $request, GetLlmTokenUsageStats $stats): JsonResponse
    {
        $data = $request->validate([
            'dias' => ['sometimes', 'integer', 'min:7', 'max:90'],
        ]);

        return response()->json([
            'data' => $stats->handle((int) ($data['dias'] ?? 30)),
        ]);
    }
}
