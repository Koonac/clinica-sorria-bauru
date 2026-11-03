<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\StoreClinicPropertyRequest;
use App\Http\Requests\Crm\UpdateClinicPropertyRequest;
use App\Models\Crm\ClinicProperty;
use App\Services\Crm\CreateClinicProperty;
use App\Services\Crm\DeleteClinicProperty;
use App\Services\Crm\ListClinicProperties;
use App\Services\Crm\UpdateClinicProperty;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ClinicPropertyController extends Controller
{
    public function index(Request $request, ListClinicProperties $list): JsonResponse
    {
        $filters = $request->validate([
            'q' => ['sometimes', 'nullable', 'string', 'max:190'],
            'deal_type' => ['sometimes', 'nullable', Rule::in(ClinicProperty::DEAL_TYPES)],
            'property_type' => ['sometimes', 'nullable', Rule::in(ClinicProperty::PROPERTY_TYPES)],
            'active' => ['sometimes', 'nullable', 'boolean'],
        ]);

        if (array_key_exists('active', $filters) && $filters['active'] === null) {
            unset($filters['active']);
        } elseif ($request->exists('active')) {
            $filters['active'] = $request->boolean('active');
        }

        $properties = $list->handle($filters)->map(fn (ClinicProperty $p) => $p->toPublicArray());

        return response()->json(['data' => $properties]);
    }

    public function store(StoreClinicPropertyRequest $request, CreateClinicProperty $create): JsonResponse
    {
        $property = $create->handle($request->validated());

        return response()->json(['data' => $property->toPublicArray()], 201);
    }

    public function show(ClinicProperty $property): JsonResponse
    {
        return response()->json(['data' => $property->toPublicArray()]);
    }

    public function update(
        UpdateClinicPropertyRequest $request,
        ClinicProperty $property,
        UpdateClinicProperty $update,
    ): JsonResponse {
        $property = $update->handle($property, $request->validated());

        return response()->json(['data' => $property->toPublicArray()]);
    }

    public function destroy(ClinicProperty $property, DeleteClinicProperty $delete): JsonResponse
    {
        return response()->json(['data' => ['id' => $delete->handle($property)]]);
    }
}
