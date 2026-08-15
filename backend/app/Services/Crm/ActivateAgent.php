<?php

namespace App\Services\Crm;

use App\Models\Crm\Agent;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ActivateAgent
{
    public function handle(Agent $agent): Agent
    {
        if (! $agent->canActivate()) {
            throw ValidationException::withMessages([
                'system_prompt' => 'Defina o system prompt antes de ativar o agent.',
            ]);
        }

        return DB::transaction(function () use ($agent) {
            Agent::withoutGlobalScopes()
                ->where('clinic_id', $agent->clinic_id)
                ->where('id', '!=', $agent->id)
                ->where('is_active', true)
                ->update(['is_active' => false]);

            $agent->forceFill(['is_active' => true])->save();

            return $agent->fresh();
        });
    }

    public function deactivate(Agent $agent): Agent
    {
        $agent->forceFill(['is_active' => false])->save();

        return $agent->fresh();
    }
}
