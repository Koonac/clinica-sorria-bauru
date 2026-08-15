<?php

namespace Tests\Feature;

use App\Models\Crm\Agent;
use App\Models\Crm\Lead;
use App\Models\User;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AgentsApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CrmSeeder::class);
    }

    private function autenticar(): User
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_cria_lista_e_atualiza_agent(): void
    {
        $user = $this->autenticar();

        $criado = $this->postJson('/api/v1/crm/agents', [
            'name' => 'SDR',
            'system_prompt' => 'Qualifique leads.',
            'debounce_seconds' => 8,
        ])->assertCreated()
            ->assertJsonPath('data.name', 'SDR')
            ->assertJsonPath('data.is_active', false);

        $id = $criado->json('data.id');

        $this->getJson('/api/v1/crm/agents')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->patchJson("/api/v1/crm/agents/{$id}", [
            'name' => 'SDR Plus',
            'debounce_seconds' => 12,
        ])->assertOk()
            ->assertJsonPath('data.name', 'SDR Plus')
            ->assertJsonPath('data.debounce_seconds', 12);
    }

    public function test_ativar_agent_desativa_os_demais_do_mesmo_user(): void
    {
        $user = $this->autenticar();

        $a = Agent::create([
            'user_id' => $user->id,
            'name' => 'A',
            'system_prompt' => 'Prompt A',
            'is_active' => true,
        ]);
        $b = Agent::create([
            'user_id' => $user->id,
            'name' => 'B',
            'system_prompt' => 'Prompt B',
            'is_active' => false,
        ]);

        $this->postJson("/api/v1/crm/agents/{$b->id}/activate")
            ->assertOk()
            ->assertJsonPath('data.is_active', true);

        $this->assertFalse($a->fresh()->is_active);
        $this->assertTrue($b->fresh()->is_active);
    }

    public function test_nao_ativa_sem_system_prompt(): void
    {
        $user = $this->autenticar();

        $agent = Agent::create([
            'user_id' => $user->id,
            'name' => 'Vazio',
            'system_prompt' => '',
            'is_active' => false,
        ]);

        $this->postJson("/api/v1/crm/agents/{$agent->id}/activate")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['system_prompt']);

        $this->assertFalse($agent->fresh()->is_active);
    }

    public function test_retoma_agent_no_lead(): void
    {
        $this->autenticar();
        $lead = Lead::create([
            'title' => 'Lead',
            'name' => 'Maria',
            'whatsapp_agent_paused_at' => now(),
        ]);

        $this->postJson("/api/v1/crm/leads/{$lead->id}/agent/resume")
            ->assertOk()
            ->assertJsonPath('data.whatsapp_agent_paused_at', null);

        $this->assertNull($lead->fresh()->whatsapp_agent_paused_at);
    }

    public function test_pausa_agent_no_lead(): void
    {
        $this->autenticar();
        $lead = Lead::create([
            'title' => 'Lead',
            'name' => 'Maria',
            'whatsapp_agent_paused_at' => null,
        ]);

        $response = $this->postJson("/api/v1/crm/leads/{$lead->id}/agent/pause")
            ->assertOk();

        $this->assertNotNull($response->json('data.whatsapp_agent_paused_at'));
        $this->assertNotNull($lead->fresh()->whatsapp_agent_paused_at);
    }

    public function test_nao_acessa_agent_de_outro_user(): void
    {
        $this->autenticar();
        $outro = User::factory()->create();
        $agent = Agent::create([
            'user_id' => $outro->id,
            'name' => 'Alheio',
            'system_prompt' => 'x',
        ]);

        $this->getJson("/api/v1/crm/agents/{$agent->id}")->assertNotFound();
    }
}
