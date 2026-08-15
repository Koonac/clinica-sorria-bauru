<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\StoreClinicServiceRequest;
use App\Http\Requests\Crm\UpdateClinicServiceRequest;
use App\Models\Crm\ClinicService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClinicServiceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ClinicService::query()->orderBy('name');

        $q = trim((string) $request->query('q', ''));
        if ($q !== '') {
            $like = '%'.$q.'%';
            $query->where(function ($builder) use ($like) {
                $builder->where('code', 'ilike', $like)
                    ->orWhere('name', 'ilike', $like);
            });
        }

        return response()->json(['data' => $query->get()]);
    }

    public function store(StoreClinicServiceRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['accepts_insurance'] = (bool) ($data['accepts_insurance'] ?? false);

        $service = ClinicService::create($data);

        return response()->json(['data' => $service], 201);
    }

    public function show(ClinicService $service): JsonResponse
    {
        return response()->json(['data' => $service]);
    }

    public function update(UpdateClinicServiceRequest $request, ClinicService $service): JsonResponse
    {
        $service->update($request->validated());

        return response()->json(['data' => $service->fresh()]);
    }

    public function destroy(ClinicService $service): JsonResponse
    {
        $id = $service->id;
        $service->delete();

        return response()->json(['data' => ['id' => $id]]);
    }
}
