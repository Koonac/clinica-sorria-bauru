<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureUserHasRole;
use App\Models\Clinic;
use App\Models\User;
use Database\Seeders\AdminUserSeeder;
use Database\Seeders\ClinicSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ClinicSeeder::class);
    }

    public function test_login_unico_funciona_para_admin_e_funcionario(): void
    {
        $clinic = Clinic::query()->firstOrFail();
        User::factory()->admin()->create([
            'username' => 'AdminTest',
            'password' => 'senha-admin',
        ]);
        User::factory()->funcionario()->create([
            'username' => 'FuncTest',
            'password' => 'senha-func',
            'clinic_id' => $clinic->id,
        ]);

        $this->postJson('/api/v1/auth/login', [
            'user' => 'AdminTest',
            'password' => 'senha-admin',
            'device_name' => 'test',
        ])
            ->assertOk()
            ->assertJsonPath('token_type', 'Bearer')
            ->assertJsonPath('user.role', User::ROLE_ADMIN)
            ->assertJsonPath('user.username', 'AdminTest');

        $this->postJson('/api/v1/auth/login', [
            'user' => 'functest',
            'password' => 'senha-func',
        ])
            ->assertOk()
            ->assertJsonPath('user.role', User::ROLE_FUNCIONARIO);
    }

    public function test_credenciais_invalidas_retornam_erro_de_validacao(): void
    {
        User::factory()->admin()->create([
            'username' => 'Admin',
            'password' => 'senha-certa',
        ]);

        $this->postJson('/api/v1/auth/login', [
            'user' => 'Admin',
            'password' => 'senha-errada',
        ])->assertUnprocessable();
    }

    public function test_seeder_cria_admin_e_developer_com_usernames_fixos(): void
    {
        $this->seed(AdminUserSeeder::class);

        $this->assertDatabaseCount('users', 2);
        $this->assertDatabaseHas('users', [
            'username' => 'Admin',
            'name' => 'Admin',
            'role' => User::ROLE_ADMIN,
            'clinic_id' => Clinic::query()->where('slug', 'sorria-bauru')->value('id'),
        ]);
        $this->assertDatabaseHas('users', [
            'username' => 'henrique',
            'name' => 'Henrique',
            'role' => User::ROLE_DEVELOPER,
        ]);
        $this->assertDatabaseHas('users', [
            'username' => 'henrique',
            'clinic_id' => null,
        ]);
    }

    public function test_altera_senha_com_senha_atual(): void
    {
        $user = User::factory()->admin()->create([
            'username' => 'Admin',
            'password' => 'SenhaAntiga123!',
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/auth/password', [
            'current_password' => 'SenhaAntiga123!',
            'password' => 'SenhaNova123!',
            'password_confirmation' => 'SenhaNova123!',
        ])->assertOk();

        $this->postJson('/api/v1/auth/login', [
            'user' => 'Admin',
            'password' => 'SenhaNova123!',
        ])->assertOk();
    }

    public function test_altera_senha_rejeita_senha_atual_errada(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create([
            'password' => 'SenhaCerta123!',
        ]));

        $this->postJson('/api/v1/auth/password', [
            'current_password' => 'errada',
            'password' => 'SenhaNova123!',
            'password_confirmation' => 'SenhaNova123!',
        ])->assertUnprocessable();
    }

    public function test_me_e_logout_com_token(): void
    {
        $user = User::factory()->admin()->create();

        $token = $user->createToken('spa')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.id', $user->id)
            ->assertJsonPath('data.role', User::ROLE_ADMIN);

        $this->withToken($token)
            ->postJson('/api/v1/auth/logout')
            ->assertOk();

        $this->assertSame(0, $user->tokens()->count());

        $this->app['auth']->forgetGuards();

        $this->withToken($token)
            ->getJson('/api/v1/auth/me')
            ->assertUnauthorized();
    }

    public function test_logout_all_preserva_token_de_servico_interface(): void
    {
        $user = User::factory()->admin()->create();
        $user->createToken('interface');
        $spaToken = $user->createToken('spa')->plainTextToken;

        $this->withToken($spaToken)
            ->postJson('/api/v1/auth/logout-all')
            ->assertOk();

        $this->assertTrue($user->tokens()->where('name', 'interface')->exists());
        $this->assertFalse($user->tokens()->where('name', 'spa')->exists());
    }

    public function test_middleware_role_bloqueia_perfil_errado(): void
    {
        $funcionario = User::factory()->funcionario()->create();

        $request = Request::create('/test', 'GET');
        $request->setUserResolver(fn () => $funcionario);

        $response = (new EnsureUserHasRole)->handle(
            $request,
            fn () => response('ok'),
            User::ROLE_ADMIN,
        );

        $this->assertSame(403, $response->getStatusCode());
    }

    public function test_admin_cria_lista_e_atualiza_usuarios(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $criado = $this->postJson('/api/v1/users', [
            'name' => 'Maria Funcionária',
            'username' => 'maria',
            'email' => 'maria@teste.local',
            'password' => 'SenhaForte123!',
            'role' => User::ROLE_FUNCIONARIO,
            'clinic_id' => Clinic::query()->firstOrFail()->id,
        ])->assertCreated()
            ->assertJsonPath('data.role', User::ROLE_FUNCIONARIO)
            ->assertJsonPath('data.username', 'maria')
            ->json('data');

        $this->getJson('/api/v1/users')
            ->assertOk()
            ->assertJsonFragment(['username' => 'maria']);

        $this->patchJson('/api/v1/users/'.$criado['id'], [
            'role' => User::ROLE_ADMIN,
            'name' => 'Maria Admin',
        ])
            ->assertOk()
            ->assertJsonPath('data.role', User::ROLE_ADMIN)
            ->assertJsonPath('data.name', 'Maria Admin');

        $this->postJson('/api/v1/auth/login', [
            'user' => 'maria',
            'password' => 'SenhaForte123!',
        ])
            ->assertOk()
            ->assertJsonPath('user.role', User::ROLE_ADMIN);
    }

    public function test_funcionario_nao_gerencia_usuarios(): void
    {
        Sanctum::actingAs(User::factory()->funcionario()->create());

        $this->getJson('/api/v1/users')->assertForbidden();
        $this->postJson('/api/v1/users', [
            'name' => 'X',
            'username' => 'xuser',
            'email' => 'x@teste.local',
            'password' => 'SenhaForte123!',
            'role' => User::ROLE_FUNCIONARIO,
        ])->assertForbidden();
    }

    public function test_developer_acessa_rotas_de_admin(): void
    {
        Sanctum::actingAs(User::factory()->developer()->create());

        $this->getJson('/api/v1/users')->assertOk();
    }

    public function test_nao_permite_atribuir_role_developer_via_api(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->postJson('/api/v1/users', [
            'name' => 'Dev Interno',
            'username' => 'devinterno',
            'email' => 'dev@teste.local',
            'password' => 'SenhaForte123!',
            'role' => User::ROLE_DEVELOPER,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['role']);
    }

    public function test_nao_exclui_ultimo_admin_nem_a_propria_conta(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $this->deleteJson('/api/v1/users/'.$admin->id)->assertUnprocessable();

        $outroAdmin = User::factory()->admin()->create();
        $this->deleteJson('/api/v1/users/'.$outroAdmin->id)->assertOk();

        $this->patchJson('/api/v1/users/'.$admin->id, [
            'role' => User::ROLE_FUNCIONARIO,
            'clinic_id' => Clinic::query()->firstOrFail()->id,
        ])->assertUnprocessable();
    }
}
