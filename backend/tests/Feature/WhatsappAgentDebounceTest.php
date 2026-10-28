<?php

namespace Tests\Feature;

use App\Jobs\Crm\ProcessWhatsappAiReplyJob;
use App\Models\Crm\Agent;
use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class WhatsappAgentDebounceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CrmSeeder::class);
        config([
            'services.openrouter.key' => 'test-key',
            'services.openrouter.agent_model' => 'openai/gpt-4o-mini',
            'services.whatsapp.url' => 'http://whatsapp.test',
            // Debounce deslizante só existe em fila assíncrona (a síncrona não sabe atrasar).
            'queue.default' => 'database',
        ]);
        Queue::fake();
        Http::fake([
            'openrouter.ai/*' => Http::response([
                'choices' => [[
                    'message' => [
                        'role' => 'assistant',
                        'content' => null,
                        'tool_calls' => [[
                            'id' => 'call_1',
                            'type' => 'function',
                            'function' => ['name' => 'enviar_resposta', 'arguments' => '{"texto":"Olá!"}'],
                        ]],
                    ],
                ]],
            ]),
            'whatsapp.test/*' => Http::response(['success' => true, 'to' => '5511999990000@c.us', 'messageId' => 'out-1']),
        ]);
    }

    /**
     * @return array{0: User, 1: Connection, 2: Lead}
     */
    private function scenario(): array
    {
        [$user, $connection] = $this->userWithWhatsappConnection();
        Agent::create([
            'user_id' => $user->id,
            'name' => 'Bot',
            'system_prompt' => 'Atenda.',
            'debounce_seconds' => 10,
            'is_active' => true,
        ]);
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'whatsapp_jid' => '5511999990000@c.us',
        ]);

        return [$user, $connection, $lead];
    }

    private function inbound(User $user, Connection $connection, Lead $lead, string $body): void
    {
        WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $user->id,
            'session_id' => 'sess-1',
            'whatsapp_jid' => '5511999990000@c.us',
            'phone_number' => '5511999990000',
            'direction' => 'inbound',
            'body' => $body,
            'message_id' => 'msg-'.uniqid(),
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $lead->id,
            'wa_timestamp' => now(),
        ]);
    }

    private function runJob(Connection $connection, Lead $lead, int $firstQueuedAt): void
    {
        $this->app->call([new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$lead->id, $firstQueuedAt), 'handle']);
    }

    public function test_mensagem_recente_reagenda_em_vez_de_responder(): void
    {
        [$user, $connection, $lead] = $this->scenario();
        $first = now()->timestamp;
        $this->inbound($user, $connection, $lead, 'Oi');
        $this->travel(10)->seconds();
        $this->inbound($user, $connection, $lead, 'queria saber o preço'); // chegou agora: ainda digitando

        $this->runJob($connection, $lead, $first);

        Http::assertNothingSent();
        Queue::assertPushed(ProcessWhatsappAiReplyJob::class, function (ProcessWhatsappAiReplyJob $job) use ($first) {
            return $job->firstQueuedAt === $first
                && $job->delay !== null
                && abs(now()->diffInSeconds($job->delay, false) - 10) <= 1;
        });
    }

    public function test_responde_quando_paciente_fica_em_silencio_pelo_debounce(): void
    {
        [$user, $connection, $lead] = $this->scenario();
        $first = now()->timestamp;
        $this->inbound($user, $connection, $lead, 'Oi');
        $this->travel(10)->seconds();

        $this->runJob($connection, $lead, $first);

        Queue::assertNothingPushed();
        $this->assertDatabaseHas('whatsapp_messages', ['direction' => 'outbound', 'lead_id' => $lead->id]);
    }

    public function test_teto_de_espera_forca_resposta_mesmo_com_mensagens_seguidas(): void
    {
        [$user, $connection, $lead] = $this->scenario();
        $first = now()->timestamp;
        $this->travel(61)->seconds();
        $this->inbound($user, $connection, $lead, 'mais uma mensagem'); // ainda digitando, mas já passou do teto

        $this->runJob($connection, $lead, $first);

        Queue::assertNothingPushed();
        $this->assertDatabaseHas('whatsapp_messages', ['direction' => 'outbound', 'lead_id' => $lead->id]);
    }
}
