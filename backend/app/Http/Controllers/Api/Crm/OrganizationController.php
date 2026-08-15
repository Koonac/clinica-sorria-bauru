<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\StoreOrganizationRequest;
use App\Models\Crm\Organization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrganizationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Organization::query()->orderBy('name');

        if ($search = trim((string) $request->query('search'))) {
            $query->whereLike('name', '%'.$search.'%', caseSensitive: false);
        }

        return response()->json($query->paginate(50));
    }

    public function store(StoreOrganizationRequest $request): JsonResponse
    {
        $organization = Organization::create($request->validated());

        return response()->json(['data' => $organization], 201);
    }
}
