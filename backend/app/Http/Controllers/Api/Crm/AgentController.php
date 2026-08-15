<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\StoreAgentRequest;
use App\Http\Requests\Crm\UpdateAgentRequest;
use App\Models\Crm\Agent;
use App\Services\Crm\ActivateAgent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AgentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $agents = Agent::query()
            ->forUser($request->user()->id)
            ->orderByDesc('is_active')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $agents]);
    }

    public function store(StoreAgentRequest $request, ActivateAgent $activator): JsonResponse
    {
        $data = $request->validated();
        $data['user_id'] = $request->user()->id;
        $data['debounce_seconds'] = $data['debounce_seconds'] ?? 10;
        $wantActive = (bool) ($data['is_active'] ?? false);
        unset($data['is_active']);
        $data['is_active'] = false;

        $agent = Agent::create($data);

        if ($wantActive) {
            $agent = $activator->handle($agent);
        } else {
            $agent = $agent->fresh();
        }

        return response()->json(['data' => $agent], 201);
    }

    public function show(Request $request, Agent $agent): JsonResponse
    {
        $this->authorizeOwner($request, $agent);

        return response()->json(['data' => $agent]);
    }

    public function update(UpdateAgentRequest $request, Agent $agent, ActivateAgent $activator): JsonResponse
    {
        $this->authorizeOwner($request, $agent);

        $data = $request->validated();
        $wantActive = array_key_exists('is_active', $data) ? (bool) $data['is_active'] : null;
        unset($data['is_active']);

        if ($data !== []) {
            $agent->update($data);
            $agent = $agent->fresh();
        }

        if ($wantActive === true) {
            $agent = $activator->handle($agent);
        } elseif ($wantActive === false) {
            $agent = $activator->deactivate($agent);
        }

        return response()->json(['data' => $agent]);
    }

    public function destroy(Request $request, Agent $agent): JsonResponse
    {
        $this->authorizeOwner($request, $agent);
        $agent->delete();

        return response()->json(['ok' => true]);
    }

    public function activate(Request $request, Agent $agent, ActivateAgent $activator): JsonResponse
    {
        $this->authorizeOwner($request, $agent);

        return response()->json(['data' => $activator->handle($agent)]);
    }

    public function deactivate(Request $request, Agent $agent, ActivateAgent $activator): JsonResponse
    {
        $this->authorizeOwner($request, $agent);

        return response()->json(['data' => $activator->deactivate($agent)]);
    }

    private function authorizeOwner(Request $request, Agent $agent): void
    {
        abort_unless((int) $agent->user_id === (int) $request->user()->id, 404);
    }
}
