<?php

namespace Tests\Feature;

use App\Models\Clinic;
use App\Models\Crm\Agent;
use App\Models\User;
use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\WhatsappAgentToolRegistry;
use App\Support\ClinicContext;
use Database\Seeders\ClinicSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ClinicTemplateApiTest extends TestCase
{
    use RefreshDatabase;

    private Clinic $clinic;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ClinicSeeder::class);
        $this->clinic = Clinic::query()->where('slug', 'sorria-bauru')->firstOrFail();
        Storage::fake('public');
    }

    public function test_developer_cria_modelo_imobiliaria(): void
    {
        Sanctum::actingAs(User::factory()->developer()->create());

        $this->postJson('/api/v1/clinics', [
            'name' => 'Imobiliária Centro',
            'template' => Clinic::TEMPLATE_IMOBILIARIA,
        ])
            ->assertCreated()
            ->assertJsonPath('data.template', 'imobiliaria')
            ->assertJsonPath('data.name', 'Imobiliária Centro');
    }

    public function test_criar_modelo_exige_template(): void
    {
        Sanctum::actingAs(User::factory()->developer()->create());

        $this->postJson('/api/v1/clinics', [
            'name' => 'Sem template',
        ])->assertUnprocessable();
    }

    public function test_developer_exclui_modelo_e_desvincula_usuarios(): void
    {
        $target = Clinic::query()->create([
            'name' => 'Para excluir',
            'slug' => 'para-excluir',
            'template' => Clinic::TEMPLATE_CLINICA,
            'is_active' => true,
        ]);
        $user = User::factory()->admin()->forClinic($target->id)->create();

        Sanctum::actingAs(User::factory()->developer()->create());

        $this->deleteJson('/api/v1/clinics/'.$target->id)
            ->assertOk()
            ->assertJsonPath('data.id', $target->id);

        $this->assertDatabaseMissing('clinics', ['id' => $target->id]);
        $this->assertNull($user->fresh()?->clinic_id);
    }

    public function test_admin_nao_pode_excluir_modelo(): void
    {
        Sanctum::actingAs(User::factory()->admin()->forClinic($this->clinic->id)->create());

        $this->deleteJson('/api/v1/clinics/'.$this->clinic->id)->assertForbidden();
    }

    public function test_crud_imoveis_com_imagem(): void
    {
        $imob = Clinic::query()->create([
            'name' => 'Imob Teste',
            'slug' => 'imob-teste',
            'template' => Clinic::TEMPLATE_IMOBILIARIA,
            'is_active' => true,
        ]);

        Sanctum::actingAs(User::factory()->developer()->create());

        $create = $this->withHeader('X-Clinic-Id', (string) $imob->id)
            ->post('/api/v1/crm/properties', [
                'title' => 'Apartamento Centro',
                'address' => 'Rua das Flores, 100',
                'price' => 350000,
                'deal_type' => 'compra',
                'property_type' => 'apartamento',
                'image' => UploadedFile::fake()->image('fachada.jpg', 400, 300),
            ], ['Accept' => 'application/json'])
            ->assertCreated();

        $id = $create->json('data.id');
        $this->assertNotEmpty($create->json('data.image_url'));
        $this->assertSame('compra', $create->json('data.deal_type'));

        $this->withHeader('X-Clinic-Id', (string) $imob->id)
            ->getJson('/api/v1/crm/properties?q=flores')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->withHeader('X-Clinic-Id', (string) $imob->id)
            ->deleteJson('/api/v1/crm/properties/'.$id)
            ->assertOk();

        $this->assertDatabaseMissing('clinic_properties', ['id' => $id]);
    }

    public function test_imobiliaria_rejeita_categoria_de_convenio(): void
    {
        $imob = Clinic::query()->create([
            'name' => 'Imob Knowledge',
            'slug' => 'imob-knowledge',
            'template' => Clinic::TEMPLATE_IMOBILIARIA,
            'is_active' => true,
        ]);

        Sanctum::actingAs(User::factory()->developer()->create());

        $this->withHeader('X-Clinic-Id', (string) $imob->id)
            ->postJson('/api/v1/crm/knowledge', [
                'category' => 'convenios',
                'content' => 'Não deveria existir.',
            ])
            ->assertUnprocessable();

        $this->withHeader('X-Clinic-Id', (string) $imob->id)
            ->postJson('/api/v1/crm/knowledge', [
                'category' => 'endereco',
                'content' => 'Rua das Imobiliárias, 10',
            ])
            ->assertCreated();
    }

    public function test_agent_tools_alternam_catalogo_por_template(): void
    {
        $this->clinic->update(['template' => Clinic::TEMPLATE_IMOBILIARIA]);
        app(ClinicContext::class)->set($this->clinic->fresh());

        [$user, $connection] = $this->userWithWhatsappConnection();
        $agent = Agent::create([
            'user_id' => $user->id,
            'clinic_id' => $this->clinic->id,
            'name' => 'Agent imob',
            'is_active' => true,
        ]);

        $context = new AgentContext(
            user: $user,
            connection: $connection->fresh(),
            agent: $agent,
            chatKey: 'chat',
            jid: 'jid',
            sessionId: 'sess',
            lead: null,
            deal: null,
            leadStages: [],
        );

        $names = array_map(
            fn (array $tool) => $tool['function']['name'] ?? '',
            app(WhatsappAgentToolRegistry::class)->openAiTools($context),
        );

        $this->assertContains('consultar_imoveis', $names);
        $this->assertNotContains('consultar_servicos', $names);
    }
}
