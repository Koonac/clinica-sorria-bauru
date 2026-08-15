<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\StoreTaskRequest;
use App\Http\Requests\Crm\UpdateTaskRequest;
use App\Models\Crm\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Task::query()->with('user')->orderedByDue();

        if ($leadId = $request->query('lead_id')) {
            $query->where('lead_id', $leadId);
        }

        if ($dealId = $request->query('deal_id')) {
            $query->where('deal_id', $dealId);
        }

        if ($request->boolean('pending')) {
            $query->pending();
        }

        return response()->json(['data' => $query->get()]);
    }

    public function store(StoreTaskRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['user_id'] = $request->user()?->id;

        $task = Task::create($data);

        return response()->json(['data' => $task->load('user')], 201);
    }

    public function update(UpdateTaskRequest $request, Task $task): JsonResponse
    {
        $data = $request->validated();

        if (array_key_exists('done', $data)) {
            $data['done_at'] = $data['done'] ? ($task->done_at ?? now()) : null;
            unset($data['done']);
        }

        $task->update($data);

        return response()->json(['data' => $task->fresh('user')]);
    }

    public function destroy(Task $task): JsonResponse
    {
        $task->delete();

        return response()->json(['data' => ['id' => $task->id]]);
    }
}
