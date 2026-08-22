<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\StoreClinicRequest;
use App\Http\Requests\Crm\UpdateClinicRequest;
use App\Models\Clinic;
use App\Services\Crm\CreateClinic;
use App\Services\Crm\ListClinics;
use App\Services\Crm\UpdateClinic;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClinicController extends Controller
{
    public function index(Request $request, ListClinics $list): JsonResponse
    {
        $onlyActive = $request->boolean('active', false);
        $clinics = $list->handle($request->user(), $onlyActive)->map(fn (Clinic $c) => $c->toPublicArray());

        return response()->json(['data' => $clinics]);
    }

    public function store(StoreClinicRequest $request, CreateClinic $create): JsonResponse
    {
        $clinic = $create->handle($request->validated());

        return response()->json(['data' => $clinic->toPublicArray()], 201);
    }

    public function show(Request $request, Clinic $clinic): JsonResponse
    {
        $user = $request->user();
        if (
            $user
            && ! $user->isDeveloper()
            && (int) $user->clinic_id !== (int) $clinic->id
        ) {
            return response()->json(['message' => 'Acesso não autorizado para esta clínica.'], 403);
        }

        return response()->json(['data' => $clinic->toPublicArray()]);
    }

    public function update(UpdateClinicRequest $request, Clinic $clinic, UpdateClinic $update): JsonResponse
    {
        $clinic = $update->handle($clinic, $request->validated());

        return response()->json(['data' => $clinic->toPublicArray()]);
    }
}
