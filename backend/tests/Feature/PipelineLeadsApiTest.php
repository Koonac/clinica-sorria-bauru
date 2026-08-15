<?php

namespace Tests\Feature;

use App\Models\Crm\Lead;
use App\Models\Crm\PipelineStage;
use App\Models\User;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PipelineLeadsApiTest extends TestCase
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

    public function test_crud_de_estagio_de_lead(): void
    {
        $this->autenticar();

        $stage = $this->postJson('/api/v1/crm/pipeline-stages', [
            'kind' => 'lead',
            'name' => 'Entrada',
            'color' => '#3b82f6',
            'status' => 'open',
        ])
            ->assertCreated()
            ->assertJsonPath('data.kind', 'lead')
            ->assertJsonPath('data.color', '#3b82f6')
            ->assertJsonPath('data.is_open', true)
            ->assertJsonPath('data.is_won', false)
            ->json('data');

        $this->patchJson("/api/v1/crm/pipeline-stages/{$stage['id']}", [
            'name' => 'Chegando',
            'color' => '#10b981',
            'status' => 'in_progress',
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Chegando')
            ->assertJsonPath('data.is_in_progress', true)
            ->assertJsonPath('data.is_open', false);

        $this->deleteJson("/api/v1/crm/pipeline-stages/{$stage['id']}")->assertOk();
        $this->assertDatabaseMissing('pipeline_stages', ['id' => $stage['id']]);
    }

    public function test_valida_cor_do_estagio(): void
    {
        $this->autenticar();

        $this->postJson('/api/v1/crm/pipeline-stages', [
            'kind' => 'lead',
            'name' => 'X',
            'color' => 'azul',
        ])->assertUnprocessable();
    }

    public function test_reordena_estagios_de_lead(): void
    {
        $this->autenticar();

        $stages = PipelineStage::ofKind('lead')->where('active', true)->orderBy('position')->get();
        $ids = $stages->pluck('id')->all();
        $reordered = array_reverse($ids);

        $this->patchJson('/api/v1/crm/pipeline-stages/order', [
            'kind' => 'lead',
            'ordered_ids' => $reordered,
        ])
            ->assertOk()
            ->assertJsonPath('data.0.id', $reordered[0]);

        $this->patchJson('/api/v1/crm/pipeline-stages/order', [
            'kind' => 'lead',
            'ordered_ids' => array_slice($ids, 0, 2),
        ])->assertUnprocessable();
    }

    public function test_mover_lead_atualiza_stage_e_registra_activity(): void
    {
        $user = $this->autenticar();

        $novo = PipelineStage::ofKind('lead')->where('slug', 'new')->first();
        $qualificado = PipelineStage::ofKind('lead')->where('slug', 'qualified')->first();

        $lead = Lead::create([
            'title' => 'Lead A',
            'name' => 'Ana',
            'status' => 'new',
            'stage_id' => $novo->id,
        ]);

        $this->postJson("/api/v1/crm/leads/{$lead->id}/move", [
            'stage_id' => $qualificado->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.stage_id', $qualificado->id);

        $this->assertDatabaseHas('activities', [
            'type' => 'stage_change',
            'lead_id' => $lead->id,
            'user_id' => $user->id,
        ]);
    }

    public function test_mover_para_estagio_perdido_exige_motivo(): void
    {
        $this->autenticar();

        $novo = PipelineStage::ofKind('lead')->where('slug', 'new')->first();
        $perdido = PipelineStage::ofKind('lead')->where('is_lost', true)->first();

        $lead = Lead::create([
            'title' => 'Lead',
            'name' => 'Ana',
            'status' => 'new',
            'stage_id' => $novo->id,
        ]);

        $this->postJson("/api/v1/crm/leads/{$lead->id}/move", [
            'stage_id' => $perdido->id,
        ])->assertUnprocessable();

        $this->postJson("/api/v1/crm/leads/{$lead->id}/move", [
            'stage_id' => $perdido->id,
            'lost_reason' => 'Sem orçamento',
        ])
            ->assertOk()
            ->assertJsonPath('data.lost_reason', 'Sem orçamento')
            ->assertJsonPath('data.stage.is_lost', true);
    }

    public function test_lead_convertido_nao_aparece_no_pipeline(): void
    {
        $this->autenticar();

        $stage = PipelineStage::ofKind('lead')->orderBy('position')->first();

        $ativo = Lead::create([
            'title' => 'Ativo',
            'name' => 'Ativo',
            'stage_id' => $stage->id,
        ]);
        $convertido = Lead::create([
            'title' => 'Convertido',
            'name' => 'Convertido',
            'status' => 'converted',
            'stage_id' => $stage->id,
        ]);

        $this->postJson("/api/v1/crm/leads/{$ativo->id}/convert")->assertCreated();

        $ativo->refresh();
        $this->assertNull($ativo->stage_id);
        $this->assertSame('converted', $ativo->status);

        $resposta = $this->getJson('/api/v1/crm/pipeline?kind=lead')->assertOk();
        $ids = collect($resposta->json('data'))
            ->flatMap(fn ($s) => $s['leads'] ?? [])
            ->pluck('id')
            ->all();

        $this->assertNotContains($ativo->id, $ids);
        $this->assertNotContains($convertido->id, $ids);
    }

    public function test_exclui_lead(): void
    {
        $this->autenticar();

        $stage = PipelineStage::ofKind('lead')->orderBy('position')->first();
        $lead = Lead::create([
            'title' => 'Para apagar',
            'name' => 'Para apagar',
            'stage_id' => $stage->id,
        ]);

        $this->deleteJson("/api/v1/crm/leads/{$lead->id}")
            ->assertOk()
            ->assertJsonPath('ok', true);

        $this->assertDatabaseMissing('leads', ['id' => $lead->id]);
    }

    public function test_bloqueia_exclusao_de_estagio_com_leads(): void
    {
        $this->autenticar();

        $stage = PipelineStage::ofKind('lead')->orderBy('position')->first();

        Lead::create([
            'title' => 'Lead',
            'name' => 'Ana',
            'stage_id' => $stage->id,
        ]);

        $this->deleteJson("/api/v1/crm/pipeline-stages/{$stage->id}")->assertUnprocessable();
        $this->assertDatabaseHas('pipeline_stages', ['id' => $stage->id]);
    }

    public function test_lead_criado_sem_stage_entra_no_primeiro_estagio(): void
    {
        $this->autenticar();

        $primeiro = PipelineStage::ofKind('lead')->where('active', true)->orderBy('position')->first();

        $this->postJson('/api/v1/crm/leads', ['name' => 'Novato'])
            ->assertCreated()
            ->assertJsonPath('data.stage_id', $primeiro->id);
    }

    public function test_pipeline_lead_agrupa_leads_por_estagio(): void
    {
        $this->autenticar();

        $stage = PipelineStage::ofKind('lead')->where('slug', 'new')->first();

        Lead::create(['title' => 'A', 'name' => 'A', 'stage_id' => $stage->id]);
        Lead::create(['title' => 'B', 'name' => 'B', 'stage_id' => $stage->id]);

        $resposta = $this->getJson('/api/v1/crm/pipeline?kind=lead')->assertOk();

        $stages = collect($resposta->json('data'));
        $this->assertGreaterThanOrEqual(4, $stages->count());

        $novo = $stages->firstWhere('slug', 'new');
        $this->assertCount(2, $novo['leads']);
    }

    public function test_pipeline_exige_kind(): void
    {
        $this->autenticar();
        $this->getJson('/api/v1/crm/pipeline')->assertUnprocessable();
        $this->getJson('/api/v1/crm/pipeline-stages')->assertUnprocessable();
    }
}
