<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CalendarApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CrmSeeder::class);
        config([
            'services.google_calendar.client_id' => 'cid',
            'services.google_calendar.client_secret' => 'csecret',
        ]);
        Sanctum::actingAs(User::factory()->admin()->create([
            'clinic_id' => $this->defaultClinic()->id,
        ]));
    }

    private function connectGoogle(): void
    {
        $this->defaultClinic()->forceFill([
            'google_calendar_refresh_token' => 'rtoken',
            'google_calendar_id' => 'primary',
        ])->save();
    }

    /**
     * @param  array<string, mixed>  $event
     */
    private function fakeGoogle(array $event = [], string $method = 'GET'): void
    {
        $item = array_replace([
            'id' => 'evt-1',
            'summary' => 'Consulta',
            'description' => 'Avaliação',
            'location' => 'Sala 1',
            'htmlLink' => 'https://calendar.google.com/event?eid=1',
            'start' => ['dateTime' => '2026-11-03T12:00:00Z'],
            'end' => ['dateTime' => '2026-11-03T13:00:00Z'],
        ], $event);

        Http::fake(function (HttpRequest $request) use ($item, $method) {
            if (str_contains($request->url(), 'oauth2')) {
                return Http::response(['access_token' => 'atok', 'expires_in' => 3600]);
            }

            if (str_contains($request->url(), '/calendars/') && str_contains($request->url(), '/events')) {
                if ($request->method() === 'GET') {
                    return Http::response(['items' => [$item]]);
                }
                if ($request->method() === $method || in_array($request->method(), ['POST', 'PATCH'], true)) {
                    return Http::response($item, $request->method() === 'POST' ? 200 : 200);
                }
                if ($request->method() === 'DELETE') {
                    return Http::response(null, 204);
                }
            }

            return Http::response(['error' => ['message' => 'unexpected']], 500);
        });
    }

    public function test_status_sem_token_usa_tarefas_do_crm(): void
    {
        $this->defaultClinic()->forceFill(['google_calendar_refresh_token' => null])->save();

        $this->getJson('/api/v1/crm/calendar/status')
            ->assertOk()
            ->assertJsonPath('data.configured', false)
            ->assertJsonPath('data.provedor', 'crm_tasks')
            ->assertJsonPath('data.calendar_id', null);
    }

    public function test_status_com_token_marca_google(): void
    {
        $this->connectGoogle();

        $this->getJson('/api/v1/crm/calendar/status')
            ->assertOk()
            ->assertJsonPath('data.configured', true)
            ->assertJsonPath('data.provedor', 'google')
            ->assertJsonPath('data.calendar_id', 'primary');
    }

    public function test_listar_sem_google_retorna_503(): void
    {
        $this->defaultClinic()->forceFill(['google_calendar_refresh_token' => null])->save();

        $this->getJson('/api/v1/crm/calendar/events?timeMin=2026-11-01T00:00:00Z&timeMax=2026-12-01T00:00:00Z')
            ->assertStatus(503)
            ->assertJsonPath('message', fn ($v) => str_contains((string) $v, 'não configurado'));
    }

    public function test_listar_eventos_com_google(): void
    {
        $this->connectGoogle();
        $this->fakeGoogle();

        $this->getJson('/api/v1/crm/calendar/events?timeMin=2026-11-01T00:00:00Z&timeMax=2026-12-01T00:00:00Z')
            ->assertOk()
            ->assertJsonPath('data.0.id', 'evt-1')
            ->assertJsonPath('data.0.summary', 'Consulta')
            ->assertJsonPath('data.0.allDay', false)
            ->assertJsonPath('data.0.location', 'Sala 1');

        Http::assertSent(fn (HttpRequest $r) => $r->method() === 'GET' && str_contains($r->url(), '/events'));
    }

    public function test_criar_atualizar_e_excluir_evento(): void
    {
        $this->connectGoogle();
        $this->fakeGoogle(['id' => 'evt-new', 'summary' => 'Limpeza']);

        $this->postJson('/api/v1/crm/calendar/events', [
            'summary' => 'Limpeza',
            'start' => '2026-11-10T14:00:00-03:00',
            'end' => '2026-11-10T15:00:00-03:00',
            'description' => 'Retorno',
        ])
            ->assertCreated()
            ->assertJsonPath('data.id', 'evt-new')
            ->assertJsonPath('data.summary', 'Limpeza');

        $this->patchJson('/api/v1/crm/calendar/events/evt-new', [
            'summary' => 'Limpeza',
            'start' => '2026-11-10T16:00:00-03:00',
            'end' => '2026-11-10T17:00:00-03:00',
        ])->assertOk()->assertJsonPath('data.id', 'evt-new');

        $this->deleteJson('/api/v1/crm/calendar/events/evt-new')
            ->assertOk()
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.id', 'evt-new');
    }

    public function test_criar_sem_google_retorna_503(): void
    {
        $this->defaultClinic()->forceFill(['google_calendar_refresh_token' => null])->save();

        $this->postJson('/api/v1/crm/calendar/events', [
            'summary' => 'Limpeza',
            'start' => '2026-11-10T14:00:00-03:00',
            'end' => '2026-11-10T15:00:00-03:00',
        ])->assertStatus(503);
    }

    public function test_criar_exige_titulo_e_horario(): void
    {
        $this->connectGoogle();

        $this->postJson('/api/v1/crm/calendar/events', [
            'start' => '2026-11-10T14:00:00-03:00',
            'end' => '2026-11-10T15:00:00-03:00',
        ])->assertUnprocessable()->assertJsonValidationErrors('summary');
    }

    public function test_atualizar_exige_start_e_end_juntos(): void
    {
        $this->connectGoogle();

        $this->patchJson('/api/v1/crm/calendar/events/evt-1', [
            'start' => '2026-11-10T14:00:00-03:00',
        ])->assertUnprocessable()->assertJsonValidationErrors('end');
    }
}
