<?php

namespace Tests\Feature;

use App\Models\Clinic;
use App\Models\User;
use Database\Seeders\ClinicSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ClinicScopeApiTest extends TestCase
{
    use RefreshDatabase;

    private Clinic $clinicA;

    private Clinic $clinicB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ClinicSeeder::class);
        $this->clinicA = Clinic::query()->where('slug', 'sorria-bauru')->firstOrFail();
        $this->clinicB = Clinic::query()->create([
            'name' => 'Clínica Outra',
            'slug' => 'clinica-outra',
            'is_active' => true,
        ]);
    }

    public function test_developer_pode_criar_clinica(): void
    {
        Sanctum::actingAs(User::factory()->developer()->create());

        $this->postJson('/api/v1/clinics', [
            'name' => 'Nova Clínica',
            'slug' => 'nova-clinica',
        ])
            ->assertCreated()
            ->assertJsonPath('data.slug', 'nova-clinica');
    }

    public function test_admin_nao_pode_criar_clinica(): void
    {
        Sanctum::actingAs(User::factory()->admin()->forClinic($this->clinicA->id)->create());

        $this->postJson('/api/v1/clinics', [
            'name' => 'Bloqueada',
            'slug' => 'bloqueada',
        ])->assertForbidden();
    }

    public function test_admin_lista_somente_a_propria_clinica(): void
    {
        Sanctum::actingAs(User::factory()->admin()->forClinic($this->clinicA->id)->create());

        $this->getJson('/api/v1/clinics')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $this->clinicA->id);
    }

    public function test_developer_lista_todas_as_clinicas(): void
    {
        Sanctum::actingAs(User::factory()->developer()->create());

        $this->getJson('/api/v1/clinics')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_admin_ignora_x_clinic_id_de_outra_clinica(): void
    {
        $admin = User::factory()->admin()->forClinic($this->clinicA->id)->create();
        Sanctum::actingAs($admin);

        $this->withHeader('X-Clinic-Id', (string) $this->clinicB->id)
            ->getJson('/api/v1/crm/leads')
            ->assertOk();

        // Contexto deve permanecer na clínica do admin (sem erro 422 de clínica inválida
        // e sem acesso aos dados da outra — o middleware força clinic_id do usuário).
        $this->assertSame($this->clinicA->id, $admin->fresh()->clinic_id);
    }

    public function test_admin_cria_usuario_somente_na_propria_clinica(): void
    {
        $admin = User::factory()->admin()->forClinic($this->clinicA->id)->create();
        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/users', [
            'name' => 'Func A',
            'username' => 'func_a',
            'email' => 'func_a@example.com',
            'password' => 'SenhaForte123!',
            'role' => User::ROLE_FUNCIONARIO,
            'clinic_id' => $this->clinicB->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.clinic_id', $this->clinicA->id);
    }

    public function test_admin_lista_somente_usuarios_da_propria_clinica(): void
    {
        $admin = User::factory()->admin()->forClinic($this->clinicA->id)->create();
        User::factory()->funcionario()->forClinic($this->clinicA->id)->create(['username' => 'na_a']);
        User::factory()->funcionario()->forClinic($this->clinicB->id)->create(['username' => 'na_b']);
        User::factory()->developer()->create(['username' => 'dev_hidden']);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/users')->assertOk();
        $usernames = collect($response->json('data'))->pluck('username');

        $this->assertTrue($usernames->contains('na_a'));
        $this->assertTrue($usernames->contains($admin->username));
        $this->assertFalse($usernames->contains('na_b'));
        $this->assertFalse($usernames->contains('dev_hidden'));
    }

    public function test_admin_nao_acessa_usuario_de_outra_clinica(): void
    {
        $admin = User::factory()->admin()->forClinic($this->clinicA->id)->create();
        $other = User::factory()->funcionario()->forClinic($this->clinicB->id)->create();

        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/users/'.$other->id)->assertNotFound();
    }

    public function test_admin_pode_atualizar_propria_clinica(): void
    {
        Sanctum::actingAs(User::factory()->admin()->forClinic($this->clinicA->id)->create());

        $this->patchJson('/api/v1/clinics/'.$this->clinicA->id, [
            'name' => 'Sorria Atualizada',
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Sorria Atualizada');
    }

    public function test_admin_nao_pode_atualizar_outra_clinica(): void
    {
        Sanctum::actingAs(User::factory()->admin()->forClinic($this->clinicA->id)->create());

        $this->patchJson('/api/v1/clinics/'.$this->clinicB->id, [
            'name' => 'Hack',
        ])->assertForbidden();
    }
}
