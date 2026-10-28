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
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AgentTestModeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CrmSeeder::class);
        config([
            'services.openrouter.key' => 'test-key',
            'services.whatsapp.url' => 'http://whatsapp.test',
        ]);
    }

    private function inbound(User $user, Connection $connection, string $phone): WhatsappMessage
    {
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Paciente '.$phone,
            'mobile' => $phone,
            'whatsapp_jid' => $phone.'@c.us',
        ]);

        return WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $user->id,
            'session_id' => 'sess-1',
            'whatsapp_jid' => $phone.'@c.us',
            'phone_number' => $phone,
            'direction' => 'inbound',
            'body' => 'Oi',
            'message_id' => 'msg-'.uniqid(),
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $lead->id,
            'wa_timestamp' => now(),
        ]);
    }

    private function agent(User $user): Agent
    {
        return Agent::create([
            'user_id' => $user->id,
            'name' => 'Bot',
            'system_prompt' => 'Atenda.',
            'debounce_seconds' => 5,
            'is_active' => true,
        ]);
    }

    public function test_modo_de_teste_so_despacha_ia_para_o_numero_configurado(): void
    {
        Queue::fake();
        [$user, $connection] = $this->userWithWhatsappConnection(['agent_test_phone' => '5514999991234']);
        $this->agent($user);

        (new DispatchWhatsappAiReplyJob)->handle(new WhatsappMessageStored($this->inbound($user, $connection, '5511988887777')));
        Queue::assertNotPushed(ProcessWhatsappAiReplyJob::class);

        // WhatsApp costuma entregar o JID sem o nono dígito: deve bater do mesmo jeito.
        (new DispatchWhatsappAiReplyJob)->handle(new WhatsappMessageStored($this->inbound($user, $connection, '551499991234')));
        Queue::assertPushed(ProcessWhatsappAiReplyJob::class, 1);
    }

    public function test_sem_modo_de_teste_responde_todos(): void
    {
        Queue::fake();
        [$user, $connection] = $this->userWithWhatsappConnection(['agent_test_phone' => null]);
        $this->agent($user);

        (new DispatchWhatsappAiReplyJob)->handle(new WhatsappMessageStored($this->inbound($user, $connection, '5511988887777')));

        Queue::assertPushed(ProcessWhatsappAiReplyJob::class, 1);
    }

    public function test_job_revalida_modo_de_teste_e_nao_chama_ia(): void
    {
        Http::fake();
        [$user, $connection] = $this->userWithWhatsappConnection(['agent_test_phone' => '5514999991234']);
        $this->agent($user);
        $message = $this->inbound($user, $connection, '5511988887777');

        $this->app->call([new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$message->lead_id), 'handle']);

        Http::assertNothingSent();
    }

    public function test_follow_up_nao_vai_para_numero_fora_do_teste(): void
    {
        Http::fake();
        [$user, $connection] = $this->userWithWhatsappConnection([
            'agent_test_phone' => '5514999991234',
            'whatsapp_follow_up_enabled' => true,
        ]);
        $this->agent($user);
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Real',
            'mobile' => '5511988887777',
            'whatsapp_follow_up_due_at' => now()->subMinute(),
        ]);

        $this->app->call([new SendWhatsappFollowUpJob($lead->id), 'handle']);

        Http::assertNothingSent();
        $this->assertNull($lead->fresh()->whatsapp_follow_up_due_at);
    }

    public function test_configuracao_normaliza_e_limpa_numero_de_teste(): void
    {
        [$user] = $this->userWithWhatsappConnection();
        Sanctum::actingAs($user);

        $this->putJson('/api/v1/crm/connection/settings', ['agent_test_phone' => '(14) 99999-1234'])
            ->assertOk()
            ->assertJsonPath('data.agent_test_phone', '5514999991234');

        $this->putJson('/api/v1/crm/connection/settings', ['agent_test_phone' => 'abc'])->assertUnprocessable();

        $this->putJson('/api/v1/crm/connection/settings', ['agent_test_phone' => null])
            ->assertOk()
            ->assertJsonPath('data.agent_test_phone', null);
    }
}
