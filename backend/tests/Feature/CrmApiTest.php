<?php

namespace Tests\Feature;

use App\Models\Crm\Activity;
use App\Models\Crm\Contact;
use App\Models\Crm\Deal;
use App\Models\Crm\Lead;
use App\Models\Crm\PipelineStage;
use App\Models\User;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CrmApiTest extends TestCase
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

    public function test_rotas_crm_exigem_autenticacao(): void
    {
        $this->getJson('/api/v1/crm/leads')->assertUnauthorized();
        $this->postJson('/api/v1/crm/leads', [])->assertUnauthorized();
        $this->getJson('/api/v1/crm/pipeline')->assertUnauthorized();
    }

    public function test_cria_lead_com_contato_vinculado(): void
    {
        $this->autenticar();

        $resposta = $this->postJson('/api/v1/crm/leads', [
            'name' => 'João da Silva',
            'mobile' => '14997387369',
            'whatsapp_jid' => '5514997387369@s.whatsapp.net',
            'organization_name' => 'Padaria do João',
        ]);

        $resposta->assertCreated()
            ->assertJsonPath('data.name', 'João da Silva')
            ->assertJsonPath('data.title', 'João da Silva')
            ->assertJsonPath('data.status', 'new');

        $leadId = (int) $resposta->json('data.id');
        $contactId = (int) $resposta->json('data.contact_id');
        $this->assertGreaterThan(0, $contactId);

        $this->assertDatabaseHas('leads', [
            'id' => $leadId,
            'name' => 'João da Silva',
            'contact_id' => $contactId,
        ]);

        $this->assertDatabaseHas('contacts', [
            'id' => $contactId,
            'name' => 'João da Silva',
            'whatsapp_jid' => '5514997387369@s.whatsapp.net',
        ]);

        $this->assertDatabaseHas('whatsapp_attendance_segments', [
            'lead_id' => $leadId,
            'mode' => 'ai',
            'user_id' => null,
            'source' => 'lead_created',
        ]);
    }

    public function test_nao_permite_status_converted_via_update(): void
    {
        $this->autenticar();
        $lead = Lead::create(['title' => 'Lead X', 'name' => 'Fulano']);

        $this->patchJson("/api/v1/crm/leads/{$lead->id}", ['status' => 'converted'])
            ->assertUnprocessable();
    }

    public function test_converte_lead_criando_contato_organizacao_e_deal(): void
    {
        $this->autenticar();

        $lead = Lead::create([
            'title' => 'Maria — Instagram',
            'name' => 'Maria Souza',
            'email' => 'maria@exemplo.com',
            'whatsapp_jid' => '5514999990000@s.whatsapp.net',
            'organization_name' => 'Loja da Maria',
        ]);

        $resposta = $this->postJson("/api/v1/crm/leads/{$lead->id}/convert", [
            'value' => 2500.50,
        ]);

        $resposta->assertCreated()
            ->assertJsonPath('data.title', 'Maria — Instagram')
            ->assertJsonPath('data.contact.name', 'Maria Souza')
            ->assertJsonPath('data.organization.name', 'Loja da Maria')
            ->assertJsonPath('data.stage.slug', 'novo');

        $lead->refresh();
        $this->assertSame('converted', $lead->status);
        $this->assertNull($lead->stage_id);
        $this->assertNotNull($lead->contact_id);
        $this->assertNotNull($lead->converted_deal_id);
        $this->assertNotNull($lead->converted_at);

        $this->assertDatabaseHas('deals', [
            'lead_id' => $lead->id,
            'value' => '2500.50',
        ]);

        $this->postJson("/api/v1/crm/leads/{$lead->id}/convert")->assertUnprocessable();
    }

    public function test_conversao_reaproveita_contato_pelo_whatsapp_jid(): void
    {
        $this->autenticar();

        $contato = Contact::create([
            'name' => 'Contato Existente',
            'whatsapp_jid' => '5514988887777@s.whatsapp.net',
        ]);

        $lead = Lead::create([
            'title' => 'Lead repetido',
            'name' => 'Nome Diferente',
            'whatsapp_jid' => '5514988887777@s.whatsapp.net',
        ]);

        $this->postJson("/api/v1/crm/leads/{$lead->id}/convert")->assertCreated();

        $this->assertSame(1, Contact::count());
        $this->assertSame($contato->id, $lead->fresh()->contact_id);
    }

    public function test_mover_deal_para_ganho_fecha_e_registra_stage_change(): void
    {
        $user = $this->autenticar();

        $contato = Contact::create(['name' => 'Cliente']);
        $stageNovo = PipelineStage::ofKind('deal')->where('slug', 'novo')->first();
        $stageGanho = PipelineStage::ofKind('deal')->where('slug', 'ganho')->first();

        $deal = Deal::create([
            'title' => 'Projeto site',
            'contact_id' => $contato->id,
            'stage_id' => $stageNovo->id,
            'value' => 5000,
        ]);

        $this->patchJson("/api/v1/crm/deals/{$deal->id}", ['stage_id' => $stageGanho->id])
            ->assertOk()
            ->assertJsonPath('data.stage.slug', 'ganho')
            ->assertJsonPath('data.stage.is_won', true);

        $deal->refresh();
        $this->assertNotNull($deal->closed_at);

        $this->assertDatabaseHas('activities', [
            'type' => 'stage_change',
            'deal_id' => $deal->id,
            'user_id' => $user->id,
        ]);

        $this->patchJson("/api/v1/crm/deals/{$deal->id}", ['stage_id' => $stageNovo->id])->assertOk();
        $this->assertNull($deal->fresh()->closed_at);
    }

    public function test_mover_deal_para_perdido_exige_motivo(): void
    {
        $this->autenticar();

        $contato = Contact::create(['name' => 'Cliente']);
        $stageNovo = PipelineStage::ofKind('deal')->where('slug', 'novo')->first();
        $stagePerdido = PipelineStage::ofKind('deal')->where('slug', 'perdido')->first();

        $deal = Deal::create([
            'title' => 'Projeto site',
            'contact_id' => $contato->id,
            'stage_id' => $stageNovo->id,
            'value' => 5000,
        ]);

        $this->patchJson("/api/v1/crm/deals/{$deal->id}", ['stage_id' => $stagePerdido->id])
            ->assertUnprocessable();

        $this->patchJson("/api/v1/crm/deals/{$deal->id}", [
            'stage_id' => $stagePerdido->id,
            'lost_reason' => 'Optou pelo concorrente',
        ])
            ->assertOk()
            ->assertJsonPath('data.stage.is_lost', true)
            ->assertJsonPath('data.lost_reason', 'Optou pelo concorrente');

        $this->assertNotNull($deal->fresh()->closed_at);
    }

    public function test_exclui_deal(): void
    {
        $this->autenticar();

        $contato = Contact::create(['name' => 'Cliente']);
        $stageNovo = PipelineStage::ofKind('deal')->where('slug', 'novo')->first();

        $deal = Deal::create([
            'title' => 'Para apagar',
            'contact_id' => $contato->id,
            'stage_id' => $stageNovo->id,
        ]);

        $this->deleteJson("/api/v1/crm/deals/{$deal->id}")
            ->assertOk()
            ->assertJsonPath('ok', true);

        $this->assertDatabaseMissing('deals', ['id' => $deal->id]);
    }

    public function test_pipeline_agrupa_deals_por_estagio(): void
    {
        $this->autenticar();

        $contato = Contact::create(['name' => 'Cliente']);
        $stage = PipelineStage::ofKind('deal')->where('slug', 'proposta')->first();
        Deal::create(['title' => 'Negócio A', 'contact_id' => $contato->id, 'stage_id' => $stage->id]);

        $resposta = $this->getJson('/api/v1/crm/pipeline?kind=deal')->assertOk();

        $stages = collect($resposta->json('data'));
        $this->assertCount(6, $stages);

        $proposta = $stages->firstWhere('slug', 'proposta');
        $this->assertCount(1, $proposta['deals']);
        $this->assertSame('Negócio A', $proposta['deals'][0]['title']);
    }

    public function test_activity_exige_vinculo_com_alguma_entidade(): void
    {
        $this->autenticar();

        $this->postJson('/api/v1/crm/activities', [
            'type' => 'note',
            'body' => 'Sem vínculo',
        ])->assertUnprocessable();

        $lead = Lead::create(['title' => 'Lead', 'name' => 'Fulano']);

        $this->postJson('/api/v1/crm/activities', [
            'type' => 'note',
            'body' => 'Primeira conversa',
            'lead_id' => $lead->id,
        ])->assertCreated();

        $this->assertSame(1, Activity::where('lead_id', $lead->id)->count());
    }

    public function test_lista_leads_com_filtro_de_status_e_busca(): void
    {
        $this->autenticar();

        Lead::create(['title' => 'Lead A', 'name' => 'Ana Paula', 'status' => 'new']);
        Lead::create(['title' => 'Lead B', 'name' => 'Bruno Lima', 'status' => 'qualified']);

        $this->getJson('/api/v1/crm/leads?status=qualified')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Bruno Lima');

        $this->getJson('/api/v1/crm/leads?search=ana')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Ana Paula');
    }
}
