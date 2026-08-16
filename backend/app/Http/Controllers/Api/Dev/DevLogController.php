<?php

namespace App\Http\Controllers\Api\Dev;

use App\Http\Controllers\Controller;
use App\Models\OutboundHttpLog;
use App\Services\Dev\ListOutboundHttpLogs;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DevLogController extends Controller
{
    public function index(Request $request, ListOutboundHttpLogs $lister): JsonResponse
    {
        $filters = $request->validate([
            'provider' => ['sometimes', 'nullable', 'string', 'max:40'],
            'status' => ['sometimes', 'nullable', 'integer', 'min:100', 'max:599'],
            'search' => ['sometimes', 'nullable', 'string', 'max:255'],
            'from' => ['sometimes', 'nullable', 'date'],
            'to' => ['sometimes', 'nullable', 'date'],
            'per_page' => ['sometimes', 'integer', 'min:10', 'max:100'],
        ]);

        return response()->json($lister->handle($filters));
    }

    public function show(OutboundHttpLog $log, ListOutboundHttpLogs $lister): JsonResponse
    {
        return response()->json([
            'data' => $lister->toDetailArray($log),
        ]);
    }
}
