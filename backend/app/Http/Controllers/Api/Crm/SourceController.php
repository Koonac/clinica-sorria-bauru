<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Models\Crm\Source;
use Illuminate\Http\JsonResponse;

class SourceController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => Source::where('active', true)->orderBy('name')->get(),
        ]);
    }
}
