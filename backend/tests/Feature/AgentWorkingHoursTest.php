<?php

namespace Tests\Feature;

use App\Events\Crm\WhatsappMessageStored;
use App\Jobs\Crm\ProcessWhatsappAiReplyJob;
use App\Jobs\Crm\SendWhatsappFollowUpJob;
use App\Listeners\Crm\DispatchWhatsappAiReplyJob;
use App\Models\Crm\Agent;
use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use Carbon\Carbon;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AgentWorkingHoursTest extends TestCase
{
    use RefreshDatabase;

    private const WEEKDAYS = [
        '1' => ['start' => '08:00', 'end' => '12:00'],
        '2' => ['start' => '08:00', 'end' => '12:00'],
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CrmSeeder::class);
        config(['services.openrouter.key' => 'test-key', 'services.whatsapp.url' => 'http://whatsapp.test']);
    }

    private function at(string $datetime): void
    {
        $this->travelTo(Carbon::parse($datetime, config('app.timezone')));
    }

    private function agent(User $user, ?array $hours): Agent
    {
        return Agent::create([
            'user_id' => $user->id,
            'name' => 'Bot',
            'system_prompt' => 'Atenda.',
            'debounce_seconds' => 5,
            'is_active' => true,
            'working_hours' => $hours,
        ]);
    }

    private function inbound(User $user, Connection $connection): WhatsappMessage
    {
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'whatsapp_jid' => '5511999990000@c.us',
        ]);

        return WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $user->id,
            'session_id' => 'sess-1',
            'whatsapp_jid' => '5511999990000@c.us',
            'phone_number' => '5511999990000',
            'direction' => 'inbound',
            'body' => 'Oi',
            'message_id' => 'msg-'.uniqid(),
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $lead->id,
            'wa_timestamp' => now(),
        ]);
    }

    public function test_sem_horario_atende_sempre(): void
    {
        $this->assertTrue((new Agent)->isWorkingAt(Carbon::parse('2026-11-01 03:00:00')));
    }

    public function test_periodo_no_mesmo_dia(): void
    {
        $agent = new Agent(['working_hours' => self::WEEKDAYS]);
        $tz = config('app.timezone');

        $this->assertTrue($agent->isWorkingAt(Carbon::parse('2026-11-02 08:00:00', $tz))); // segunda
        $this->assertFalse($agent->isWorkingAt(Carbon::parse('2026-11-02 12:00:00', $tz)));
        $this->assertFalse($agent->isWorkingAt(Carbon::parse('2026-11-04 09:00:00', $tz))); // quarta
    }

    public function test_periodo_que_vira_a_madrugada(): void
    {
        $agent = new Agent(['working_hours' => ['5' => ['start' => '18:00', 'end' => '08:00']]]);
        $tz = config('app.timezone');

        $this->assertTrue($agent->isWorkingAt(Carbon::parse('2026-10-30 23:00:00', $tz))); // sexta
        $this->assertTrue($agent->isWorkingAt(Carbon::parse('2026-10-31 07:59:00', $tz))); // sábado cedo
        $this->assertFalse($agent->isWorkingAt(Carbon::parse('2026-10-31 08:00:00', $tz)));
        $this->assertFalse($agent->isWorkingAt(Carbon::parse('2026-10-30 17:59:00', $tz)));
    }

    public function test_proxima_abertura(): void
    {
        $agent = new Agent(['working_hours' => self::WEEKDAYS]);
        $tz = config('app.timezone');

        $this->assertSame(
            '2026-11-03 08:00',
            $agent->nextWorkingOpening(Carbon::parse('2026-11-02 13:00:00', $tz))->format('Y-m-d H:i'),
        );
        $this->assertSame(
            '2026-11-09 08:00',
            $agent->nextWorkingOpening(Carbon::parse('2026-11-03 09:00:00', $tz))->format('Y-m-d H:i'),
        );
    }

    public function test_fora_do_horario_nao_responde_e_dentro_responde(): void
    {
        Queue::fake();
        [$user, $connection] = $this->userWithWhatsappConnection();
        $this->agent($user, self::WEEKDAYS);

        $this->at('2026-11-02 20:00:00');
        (new DispatchWhatsappAiReplyJob)->handle(new WhatsappMessageStored($this->inbound($user, $connection)));
        Queue::assertNotPushed(ProcessWhatsappAiReplyJob::class);

        $this->at('2026-11-02 09:00:00');
        (new DispatchWhatsappAiReplyJob)->handle(new WhatsappMessageStored($this->inbound($user, $connection)));
        Queue::assertPushed(ProcessWhatsappAiReplyJob::class, 1);
    }

    public function test_job_revalida_horario_e_nao_chama_ia(): void
    {
        Http::fake();
        [$user, $connection] = $this->userWithWhatsappConnection();
        $this->agent($user, self::WEEKDAYS);
        $this->at('2026-11-02 20:00:00');
        $message = $this->inbound($user, $connection);

        $this->app->call([new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$message->lead_id), 'handle']);

        Http::assertNothingSent();
    }

    public function test_follow_up_espera_a_proxima_abertura_do_bot(): void
    {
        Http::fake();
        [$user, $connection] = $this->userWithWhatsappConnection(['whatsapp_follow_up_enabled' => true]);
        $this->agent($user, self::WEEKDAYS);
        $this->at('2026-11-02 15:00:00');
        $message = $this->inbound($user, $connection);
        $message->forceFill(['direction' => 'outbound'])->save();
        $lead = Lead::query()->findOrFail($message->lead_id);
        $lead->forceFill(['whatsapp_follow_up_due_at' => now()->subMinute()])->save();

        $this->app->call([new SendWhatsappFollowUpJob($lead->id), 'handle']);

        Http::assertNothingSent();
        $this->assertSame('2026-11-03 08:00', $lead->fresh()->whatsapp_follow_up_due_at->format('Y-m-d H:i'));
        $this->assertSame(0, $lead->fresh()->whatsapp_follow_up_step);
    }

    public function test_api_salva_limpa_e_valida_horario_do_agent(): void
    {
        [$user] = $this->userWithWhatsappConnection();
        Sanctum::actingAs($user);

        $id = $this->postJson('/api/v1/crm/agents', [
            'name' => 'Noturno',
            'working_hours' => ['5' => ['start' => '18:00', 'end' => '08:00']],
        ])->assertCreated()
            ->assertJsonPath('data.working_hours.5.end', '08:00')
            ->json('data.id');

        $this->patchJson("/api/v1/crm/agents/{$id}", ['working_hours' => ['1' => ['start' => '10:00', 'end' => '10:00']]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('working_hours.1.end');
        $this->patchJson("/api/v1/crm/agents/{$id}", ['working_hours' => ['9' => ['start' => '08:00', 'end' => '12:00']]])
            ->assertUnprocessable();
        $this->patchJson("/api/v1/crm/agents/{$id}", ['working_hours' => []])->assertUnprocessable();

        $this->patchJson("/api/v1/crm/agents/{$id}", ['working_hours' => null])
            ->assertOk()
            ->assertJsonPath('data.working_hours', null);
    }
}
