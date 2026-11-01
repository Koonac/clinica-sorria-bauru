<?php

namespace Tests\Feature;

use App\Models\Clinic;
use App\Models\Crm\Connection;
use App\Models\User;
use Database\Seeders\ClinicSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WhatsappWebhookRegisterTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ClinicSeeder::class);
        config([
            'services.whatsapp.url' => 'http://whatsapp.test',
            'app.url' => 'http://backend:8000',
        ]);
    }

    /**
     * @param  array<string, mixed>  $attrs
     * @return array{0: User, 1: Connection}
     */
    private function connectionOn(Clinic $clinic, array $attrs = []): array
    {
        $user = User::factory()->admin()->create(['clinic_id' => $clinic->id]);
        $connection = Connection::withoutGlobalScopes()->updateOrCreate(
            ['clinic_id' => $clinic->id],
            array_merge([
                'name' => 'WhatsApp principal',
                'api_username' => 'u',
                'api_password' => 'p',
                'session_id' => 'sess-'.$clinic->id,
                'webhook_token' => 'token-'.$clinic->id,
                'status' => 'connected',
                'is_business' => false,
                'created_by' => $user->id,
            ], $attrs),
        );

        return [$user, $connection];
    }

    public function test_abrir_conexao_reenvia_webhook_da_clinica_ativa(): void
    {
        $clinic = Clinic::query()->create([
            'name' => 'Clinica Teste',
            'slug' => 'clinica-teste-webhook',
            'is_active' => true,
        ]);
        [$user] = $this->connectionOn($clinic, [
            'session_id' => 'sess-teste',
            'webhook_token' => 'token-clinica-teste',
        ]);
        Sanctum::actingAs($user);

        Http::fake([
            'whatsapp.test/api/whatsapp/connect' => Http::response(['success' => true]),
        ]);

        $this->getJson('/api/v1/crm/connection')
            ->assertOk()
            ->assertJsonPath('data.clinic_id', $clinic->id);

        Http::assertSent(function (HttpRequest $request) {
            if ($request->method() !== 'POST' || ! str_contains($request->url(), '/connect')) {
                return false;
            }
            $messages = (string) data_get($request->data(), 'data.messages_url');

            return str_contains($messages, '/webhooks/messages?token=token-clinica-teste')
                && str_contains($messages, 'http://backend:8000');
        });
    }

    public function test_developer_reenvia_webhook_da_clinica_do_header(): void
    {
        $clinicA = $this->defaultClinic();
        $clinicB = Clinic::query()->create([
            'name' => 'Outra',
            'slug' => 'outra-webhook',
            'is_active' => true,
        ]);
        $this->connectionOn($clinicA, ['webhook_token' => 'token-a']);
        [, $connB] = $this->connectionOn($clinicB, ['webhook_token' => 'token-b']);

        Sanctum::actingAs(User::factory()->developer()->create());
        Http::fake([
            'whatsapp.test/api/whatsapp/connect' => Http::response(['success' => true]),
        ]);

        $this->withHeader('X-Clinic-Id', (string) $clinicB->id)
            ->getJson('/api/v1/crm/connection')
            ->assertOk()
            ->assertJsonPath('data.id', $connB->id);

        Http::assertSent(function (HttpRequest $request) {
            $messages = (string) data_get($request->data(), 'data.messages_url');

            return $request->method() === 'POST'
                && str_contains($request->url(), '/connect')
                && str_contains($messages, 'token=token-b')
                && ! str_contains($messages, 'token=token-a');
        });
    }
}
