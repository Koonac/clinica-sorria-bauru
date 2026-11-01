<?php

namespace Tests\Feature;

use App\Models\Crm\Lead;
use App\Models\Crm\PipelineStage;
use App\Models\User;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeadQualificationTest extends TestCase
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

    private function leadComDado(): Lead
    {
        $stage = PipelineStage::ofKind('lead')->where('slug', 'new')->first();

        return Lead::create([
            'title' => 'Lead Qualificação',
            'name' => 'Ana',
            'status' => 'new',
            'stage_id' => $stage?->id,
            'qualification_data' => [
                'funcionarios' => [
                    'label' => 'Funcionários',
                    'value' => '50',
                    'updated_at' => now()->toIso8601String(),
                ],
            ],
        ]);
    }

    public function test_show_e_pipeline_retornam_qualification_data(): void
    {
        $this->autenticar();
        $lead = $this->leadComDado();

        $this->getJson("/api/v1/crm/leads/{$lead->id}")
            ->assertOk()
            ->assertJsonPath('data.qualification_data.funcionarios.value', '50')
            ->assertJsonPath('data.qualification_data.funcionarios.label', 'Funcionários');

        $pipeline = $this->getJson('/api/v1/crm/pipeline?kind=lead')->assertOk()->json('data');
        $cards = collect($pipeline)->flatMap(fn ($stage) => $stage['leads'] ?? []);
        $card = $cards->firstWhere('id', $lead->id);

        $this->assertNotNull($card);
        $this->assertSame('50', $card['qualification_data']['funcionarios']['value'] ?? null);
    }

    public function test_patch_atualiza_e_limpa_qualification_data(): void
    {
        $this->autenticar();
        $lead = $this->leadComDado();

        $this->patchJson("/api/v1/crm/leads/{$lead->id}", [
            'qualification_data' => [
                'funcionarios' => '80',
                'orcamento' => '10 mil',
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.qualification_data.funcionarios.value', '80')
            ->assertJsonPath('data.qualification_data.orcamento.value', '10 mil')
            ->assertJsonPath('data.qualification_data.orcamento.label', 'orcamento');

        $this->patchJson("/api/v1/crm/leads/{$lead->id}", [
            'qualification_data' => [
                'funcionarios' => null,
            ],
        ])
            ->assertOk()
            ->assertJsonMissingPath('data.qualification_data.funcionarios')
            ->assertJsonPath('data.qualification_data.orcamento.value', '10 mil');

        $this->patchJson("/api/v1/crm/leads/{$lead->id}", [
            'qualification_data' => [
                'Funcionarios' => '9',
            ],
        ])->assertUnprocessable();
    }
}
