<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\StoreClinicKnowledgeEntryRequest;
use App\Http\Requests\Crm\UpdateClinicKnowledgeEntryRequest;
use App\Models\Crm\ClinicKnowledgeEntry;
use App\Services\Crm\Knowledge\CreateClinicKnowledgeEntry;
use App\Services\Crm\Knowledge\DeleteClinicKnowledgeEntry;
use App\Services\Crm\Knowledge\ListClinicKnowledgeEntries;
use App\Services\Crm\Knowledge\UpdateClinicKnowledgeEntry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ClinicKnowledgeController extends Controller
{
    public function index(Request $request, ListClinicKnowledgeEntries $list): JsonResponse
    {
        $filters = $request->validate([
            'category' => ['sometimes', 'nullable', Rule::in(ClinicKnowledgeEntry::CATEGORIES)],
        ]);

        return response()->json([
            'data' => $list->handle($filters),
            'meta' => ['categories' => ClinicKnowledgeEntry::CATEGORY_LABELS],
        ]);
    }

    public function store(StoreClinicKnowledgeEntryRequest $request, CreateClinicKnowledgeEntry $create): JsonResponse
    {
        return response()->json(['data' => $create->handle($request->validated())], 201);
    }

    public function update(
        UpdateClinicKnowledgeEntryRequest $request,
        ClinicKnowledgeEntry $entry,
        UpdateClinicKnowledgeEntry $update,
    ): JsonResponse {
        return response()->json(['data' => $update->handle($entry, $request->validated())]);
    }

    public function destroy(ClinicKnowledgeEntry $entry, DeleteClinicKnowledgeEntry $delete): JsonResponse
    {
        return response()->json(['data' => ['id' => $delete->handle($entry)]]);
    }
}
