<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\StoreClinicProductRequest;
use App\Http\Requests\Crm\UpdateClinicProductRequest;
use App\Models\Crm\ClinicProduct;
use App\Services\Crm\CreateClinicProduct;
use App\Services\Crm\DeleteClinicProduct;
use App\Services\Crm\ListClinicProducts;
use App\Services\Crm\UpdateClinicProduct;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ClinicProductController extends Controller
{
    public function index(Request $request, ListClinicProducts $list): JsonResponse
    {
        $filters = $request->validate([
            'q' => ['sometimes', 'nullable', 'string', 'max:190'],
            'category' => ['sometimes', 'nullable', Rule::in(ClinicProduct::CATEGORIES)],
            'audience' => ['sometimes', 'nullable', Rule::in(ClinicProduct::AUDIENCES)],
            'active' => ['sometimes', 'nullable', 'boolean'],
        ]);

        if (array_key_exists('active', $filters) && $filters['active'] === null) {
            unset($filters['active']);
        } elseif ($request->exists('active')) {
            $filters['active'] = $request->boolean('active');
        }

        $products = $list->handle($filters)->map(fn (ClinicProduct $p) => $p->toPublicArray());

        return response()->json(['data' => $products]);
    }

    public function store(StoreClinicProductRequest $request, CreateClinicProduct $create): JsonResponse
    {
        $product = $create->handle($request->validated());

        return response()->json(['data' => $product->toPublicArray()], 201);
    }

    public function show(ClinicProduct $product): JsonResponse
    {
        return response()->json(['data' => $product->toPublicArray()]);
    }

    public function update(
        UpdateClinicProductRequest $request,
        ClinicProduct $product,
        UpdateClinicProduct $update,
    ): JsonResponse {
        $product = $update->handle($product, $request->validated());

        return response()->json(['data' => $product->toPublicArray()]);
    }

    public function destroy(ClinicProduct $product, DeleteClinicProduct $delete): JsonResponse
    {
        return response()->json(['data' => ['id' => $delete->handle($product)]]);
    }
}
