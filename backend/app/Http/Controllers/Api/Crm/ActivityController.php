<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\StoreActivityRequest;
use App\Models\Crm\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActivityController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Activity::query()->with('user')->latest();

        foreach (['lead_id', 'deal_id', 'contact_id'] as $filtro) {
            if ($valor = $request->query($filtro)) {
                $query->where($filtro, $valor);
            }
        }

        if ($type = $request->query('type')) {
            $query->where('type', $type);
        }

        return response()->json($query->paginate(50));
    }

    public function store(StoreActivityRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['user_id'] = $request->user()?->id;

        $activity = Activity::create($data);

        return response()->json(['data' => $activity->load('user')], 201);
    }
}
