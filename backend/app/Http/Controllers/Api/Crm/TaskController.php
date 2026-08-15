<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\StoreTaskRequest;
use App\Http\Requests\Crm\UpdateTaskRequest;
use App\Models\Crm\Task;
use App\Services\Crm\ListTasks;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    public function index(Request $request, ListTasks $listTasks): JsonResponse
    {
        $filters = $request->validate([
            'lead_id' => ['sometimes', 'nullable', 'integer'],
            'deal_id' => ['sometimes', 'nullable', 'integer'],
            'pending' => ['sometimes', 'boolean'],
            'due_from' => ['sometimes', 'nullable', 'date'],
            'due_to' => ['sometimes', 'nullable', 'date'],
        ]);

        $filters['pending'] = $request->boolean('pending');

        return response()->json(['data' => $listTasks->handle($filters)]);
    }

    public function store(StoreTaskRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['user_id'] = $request->user()?->id;

        $task = Task::create($data);

        return response()->json([
            'data' => $task->load(['user:id,name', 'lead:id,name', 'deal:id,title']),
        ], 201);
    }

    public function update(UpdateTaskRequest $request, Task $task): JsonResponse
    {
        $data = $request->validated();

        if (array_key_exists('done', $data)) {
            $data['done_at'] = $data['done'] ? ($task->done_at ?? now()) : null;
            unset($data['done']);
        }

        $task->update($data);

        return response()->json([
            'data' => $task->fresh(['user:id,name', 'lead:id,name', 'deal:id,title']),
        ]);
    }

    public function destroy(Task $task): JsonResponse
    {
        $task->delete();

        return response()->json(['data' => ['id' => $task->id]]);
    }
}
