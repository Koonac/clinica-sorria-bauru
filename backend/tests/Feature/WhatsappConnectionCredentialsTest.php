<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\ClinicSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WhatsappConnectionCredentialsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ClinicSeeder::class);
        $this->defaultClinic();
    }

    public function test_developer_atualiza_credenciais_e_ve_usuario_da_api(): void
    {
        $this->userWithWhatsappConnection(['api_username' => 'antigo']);
        Sanctum::actingAs(User::factory()->developer()->create());

        $this->putJson('/api/v1/crm/connection/credentials', [
            'api_username' => 'novo-user',
            'api_password' => 'nova-senha',
        ])
            ->assertOk()
            ->assertJsonPath('data.api_username', 'novo-user')
            ->assertJsonPath('data.has_credentials', true);

        $this->getJson('/api/v1/crm/connection')
            ->assertOk()
            ->assertJsonPath('data.api_username', 'novo-user');
    }

    public function test_admin_nao_atualiza_credenciais_nem_ve_usuario_da_api(): void
    {
        [$admin] = $this->userWithWhatsappConnection(['api_username' => 'segredo']);
        Sanctum::actingAs($admin);

        $this->putJson('/api/v1/crm/connection/credentials', [
            'api_username' => 'hack',
            'api_password' => 'hack',
        ])->assertForbidden();

        $this->getJson('/api/v1/crm/connection')
            ->assertOk()
            ->assertJsonPath('data.has_credentials', true)
            ->assertJsonMissingPath('data.api_username');
    }

    public function test_developer_salva_credenciais_com_senha_legado_em_texto(): void
    {
        [, $connection] = $this->userWithWhatsappConnection(['api_username' => 'legado']);

        DB::table('connections')->where('id', $connection->id)->update([
            'api_password' => 'senha-em-texto-puro',
        ]);

        Sanctum::actingAs(User::factory()->developer()->create());

        $this->getJson('/api/v1/crm/connection')
            ->assertOk()
            ->assertJsonPath('data.has_credentials', true);

        $this->putJson('/api/v1/crm/connection/credentials', [
            'api_username' => 'wa-user',
            'api_password' => 'wa-pass',
        ])
            ->assertOk()
            ->assertJsonPath('data.api_username', 'wa-user')
            ->assertJsonPath('data.has_credentials', true);

        $this->assertSame('wa-pass', $connection->fresh()->api_password);
    }

    public function test_developer_salva_credenciais_mesmo_se_encriptacao_falhar(): void
    {
        $this->userWithWhatsappConnection(['api_username' => 'antigo']);
        Sanctum::actingAs(User::factory()->developer()->create());

        Crypt::shouldReceive('encrypt')->andThrow(new \RuntimeException('No application encryption key'));
        Crypt::shouldReceive('decrypt')->andThrow(new \RuntimeException('No application encryption key'));

        $this->putJson('/api/v1/crm/connection/credentials', [
            'api_username' => 'wa-user',
            'api_password' => 'wa-pass',
        ])
            ->assertOk()
            ->assertJsonPath('data.api_username', 'wa-user')
            ->assertJsonPath('data.has_credentials', true);
    }

    public function test_funcionario_nao_atualiza_credenciais(): void
    {
        $clinic = $this->defaultClinic();
        $this->userWithWhatsappConnection();

        Sanctum::actingAs(User::factory()->funcionario()->forClinic($clinic->id)->create());

        $this->putJson('/api/v1/crm/connection/credentials', [
            'api_username' => 'hack',
            'api_password' => 'hack',
        ])->assertForbidden();
    }
}
