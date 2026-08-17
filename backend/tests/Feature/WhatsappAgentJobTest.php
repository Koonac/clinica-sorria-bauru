<?php

namespace Tests\Feature;

use App\Events\Crm\WhatsappMessageStored;
use App\Jobs\Crm\ProcessWhatsappAiReplyJob;
use App\Listeners\Crm\DispatchWhatsappAiReplyJob;
use App\Models\Crm\Activity;
use App\Models\Crm\Agent;
use App\Models\Crm\Lead;
use App\Models\Crm\PipelineStage;
use App\Models\Crm\Task;
use App\Models\Crm\Connection;
use App\Models\Crm\WhatsappAttendanceSegment;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use App\Services\Crm\Agent\WhatsappAgentRunner;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class WhatsappAgentJobTest extends TestCase
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
            'services.google_calendar.client_id' => 'cid',
            'services.google_calendar.client_secret' => 'csecret',
        ]);

        $this->defaultClinic()->forceFill([
            'google_calendar_refresh_token' => 'rtoken',
            'google_calendar_id' => 'primary',
        ])->save();
    }

    /**
     * @return array{0: User, 1: Connection}
     */
    private function userConectado(): array
    {
        return $this->userWithWhatsappConnection();
    }

    private function agentAtivo(User $user, array $extra = []): Agent
    {
        return Agent::create(array_merge([
            'user_id' => $user->id,
            'name' => 'Bot',
            'system_prompt' => 'Atenda com educação.',
            'debounce_seconds' => 10,
            'is_active' => true,
        ], $extra));
    }

    private function inbound(User $user, Connection $connection, Lead $lead, string $body = 'Oi'): WhatsappMessage
    {
        return WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $user->id,
            'session_id' => 'sess-1',
            'whatsapp_jid' => '5511999990000@c.us',
            'phone_number' => '5511999990000',
            'contact_name' => $lead->name,
            'direction' => 'inbound',
            'body' => $body,
            'message_id' => 'msg-'.uniqid(),
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $lead->id,
            'wa_timestamp' => now(),
        ]);
    }

    private function runAiJob(ProcessWhatsappAiReplyJob $job): void
    {
        $this->app->call([$job, 'handle']);
    }

    public function test_listener_nao_despacha_sem_agent_ativo(): void
    {
        Queue::fake();
        [$user, $connection] = $this->userConectado();
        $lead = Lead::create(['title' => 'L', 'name' => 'Ana', 'owner_id' => $user->id]);
        $msg = $this->inbound($user, $connection, $lead);

        (new DispatchWhatsappAiReplyJob)->handle(new WhatsappMessageStored($msg));

        Queue::assertNotPushed(ProcessWhatsappAiReplyJob::class);
    }

    public function test_listener_despacha_com_delay_quando_ha_agent_ativo(): void
    {
        Queue::fake();
        [$user, $connection] = $this->userConectado();
        $this->agentAtivo($user, ['debounce_seconds' => 7]);
        $lead = Lead::create(['title' => 'L', 'name' => 'Ana', 'owner_id' => $user->id]);
        $msg = $this->inbound($user, $connection, $lead);

        (new DispatchWhatsappAiReplyJob)->handle(new WhatsappMessageStored($msg));

        Queue::assertPushed(ProcessWhatsappAiReplyJob::class, function (ProcessWhatsappAiReplyJob $job) use ($connection, $lead) {
            return $job->connectionId === $connection->id
                && $job->chatKey === 'lead:'.$lead->id
                && $job->delay !== null;
        });
    }

    public function test_listener_nao_despacha_se_lead_pausado(): void
    {
        Queue::fake();
        [$user, $connection] = $this->userConectado();
        $this->agentAtivo($user);
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'owner_id' => $user->id,
            'whatsapp_agent_paused_at' => now(),
        ]);
        $msg = $this->inbound($user, $connection, $lead);

        (new DispatchWhatsappAiReplyJob)->handle(new WhatsappMessageStored($msg));

        Queue::assertNotPushed(ProcessWhatsappAiReplyJob::class);
    }

    public function test_job_envia_resposta_via_tool_enviar_resposta(): void
    {
        Http::fake([
            'openrouter.ai/*' => Http::response([
                'choices' => [[
                    'message' => [
                        'role' => 'assistant',
                        'content' => null,
                        'tool_calls' => [[
                            'id' => 'call_1',
                            'type' => 'function',
                            'function' => [
                                'name' => 'enviar_resposta',
                                'arguments' => json_encode(['texto' => 'Olá! Como posso ajudar?'], JSON_UNESCAPED_UNICODE),
                            ],
                        ]],
                    ],
                ]],
            ], 200),
            'whatsapp.test/*' => Http::response([
                'success' => true,
                'to' => '5511999990000@c.us',
                'messageId' => 'out-1',
            ], 200),
        ]);

        [$user, $connection] = $this->userConectado();
        $this->agentAtivo($user);
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'whatsapp_jid' => '5511999990000@c.us',
            'owner_id' => $user->id,
        ]);
        $this->inbound($user, $connection, $lead, 'Quero saber mais');

        $job = new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$lead->id);
        $this->runAiJob($job);

        $this->assertDatabaseHas('whatsapp_messages', [
            'user_id' => $user->id,
            'direction' => 'outbound',
            'body' => 'Olá! Como posso ajudar?',
            'lead_id' => $lead->id,
        ]);
        $this->assertNull($lead->fresh()->whatsapp_agent_paused_at);
    }

    public function test_enviar_resposta_nao_duplica_ai_display_name(): void
    {
        Http::fake([
            'openrouter.ai/*' => Http::response([
                'choices' => [[
                    'message' => [
                        'role' => 'assistant',
                        'content' => null,
                        'tool_calls' => [[
                            'id' => 'call_1',
                            'type' => 'function',
                            'function' => [
                                'name' => 'enviar_resposta',
                                'arguments' => json_encode([
                                    'texto' => "Isabella\n\nPerfeito! Você gostaria de realizar a depilação a laser?",
                                ], JSON_UNESCAPED_UNICODE),
                            ],
                        ]],
                    ],
                ]],
            ], 200),
            'whatsapp.test/*' => Http::response([
                'success' => true,
                'to' => '5511999990000@c.us',
                'messageId' => 'out-dup-1',
            ], 200),
        ]);

        [$user, $connection] = $this->userConectado();
        $connection->forceFill(['ai_display_name' => 'Isabella'])->save();
        $this->agentAtivo($user, ['name' => 'Isabella']);
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'whatsapp_jid' => '5511999990000@c.us',
            'owner_id' => $user->id,
        ]);
        $this->inbound($user, $connection, $lead, 'Quero depilação');

        $job = new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$lead->id);
        $this->runAiJob($job);

        $outbound = WhatsappMessage::query()
            ->where('direction', 'outbound')
            ->where('lead_id', $lead->id)
            ->latest('id')
            ->first();

        $this->assertNotNull($outbound);
        $this->assertSame(
            "*_Isabella_*\n\nPerfeito! Você gostaria de realizar a depilação a laser?",
            $outbound->body
        );
        $this->assertSame(1, substr_count(strtolower((string) $outbound->body), 'isabella'));
    }

    public function test_tool_mover_lead_e_escalar_humano(): void
    {
        $stage = PipelineStage::ofKind('lead')->where('active', true)->orderBy('position')->skip(1)->first()
            ?? PipelineStage::ofKind('lead')->where('active', true)->first();
        $this->assertNotNull($stage);

        $toolCallsRound1 = [[
            'id' => 'call_move',
            'type' => 'function',
            'function' => [
                'name' => 'mover_lead',
                'arguments' => json_encode(['stage_id' => $stage->id]),
            ],
        ]];
        $toolCallsRound2 = [[
            'id' => 'call_esc',
            'type' => 'function',
            'function' => [
                'name' => 'escalar_humano',
                'arguments' => json_encode(['motivo' => 'Pediu atendente']),
            ],
        ]];

        Http::fake(function ($request) use ($toolCallsRound1, $toolCallsRound2) {
            if (str_contains($request->url(), 'openrouter.ai')) {
                static $n = 0;
                $n++;
                $calls = $n === 1 ? $toolCallsRound1 : $toolCallsRound2;

                return Http::response([
                    'choices' => [[
                        'message' => [
                            'role' => 'assistant',
                            'content' => null,
                            'tool_calls' => $calls,
                        ],
                    ]],
                ], 200);
            }

            return Http::response(['success' => true], 200);
        });

        [$user, $connection] = $this->userConectado();
        $this->agentAtivo($user);
        $funcionario = User::factory()->create([
            'clinic_id' => $connection->clinic_id,
            'role' => User::ROLE_FUNCIONARIO,
            'name' => 'Atendente Teste',
        ]);
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'whatsapp_jid' => '5511999990000@c.us',
            'owner_id' => null,
            'stage_id' => PipelineStage::ofKind('lead')->orderBy('position')->value('id'),
        ]);
        $this->inbound($user, $connection, $lead, 'Quero falar com alguém');

        $job = new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$lead->id);
        $this->runAiJob($job);

        $lead->refresh();
        $this->assertSame((int) $stage->id, (int) $lead->stage_id);
        $this->assertSame((int) $funcionario->id, (int) $lead->owner_id);
        $this->assertNotNull($lead->whatsapp_agent_paused_at);
        $this->assertNotNull($lead->whatsapp_agent_resume_at);
        $this->assertDatabaseHas('activities', [
            'lead_id' => $lead->id,
            'subject' => 'Agent escalou para humano',
        ]);
        $this->assertDatabaseHas('whatsapp_messages', [
            'lead_id' => $lead->id,
            'direction' => 'outbound',
            'body' => \App\Services\Crm\Agent\Tools\EscalarHumanoTool::TRANSFER_NOTICE,
        ]);
    }

    public function test_criar_agendamento_cria_task_e_evento_google(): void
    {
        $inicio = now()->addDay()->setTime(14, 0);
        $fim = $inicio->copy()->addHour();

        Http::fake([
            'openrouter.ai/*' => Http::response([
                'choices' => [[
                    'message' => [
                        'role' => 'assistant',
                        'content' => null,
                        'tool_calls' => [[
                            'id' => 'call_ag',
                            'type' => 'function',
                            'function' => [
                                'name' => 'criar_agendamento',
                                'arguments' => json_encode([
                                    'titulo' => 'Demo',
                                    'inicio' => $inicio->toIso8601String(),
                                    'fim' => $fim->toIso8601String(),
                                    'descricao' => 'Reunião comercial',
                                ], JSON_UNESCAPED_UNICODE),
                            ],
                        ]],
                    ],
                ]],
            ], 200),
            'googleapis.com/oauth2/*' => Http::response([
                'access_token' => 'atok',
                'expires_in' => 3600,
            ], 200),
            'googleapis.com/calendar/*' => Http::response([
                'id' => 'evt-1',
                'summary' => 'Demo',
                'htmlLink' => 'https://calendar.google.com/event?eid=1',
                'start' => ['dateTime' => $inicio->toIso8601String()],
                'end' => ['dateTime' => $fim->toIso8601String()],
            ], 200),
        ]);

        [$user, $connection] = $this->userConectado();
        $this->agentAtivo($user);
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'owner_id' => $user->id,
        ]);
        $this->inbound($user, $connection, $lead, 'Quero agendar amanhã às 14h');

        $job = new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$lead->id);
        $this->runAiJob($job);

        $task = Task::query()->where('lead_id', $lead->id)->first();
        $this->assertNotNull($task);
        $this->assertSame('Demo', $task->title);
        $this->assertStringContainsString('calendar.google.com', (string) $task->description);
    }

    public function test_texto_livre_sem_tool_nao_envia_whatsapp(): void
    {
        Http::fake([
            'openrouter.ai/*' => Http::response([
                'choices' => [[
                    'message' => [
                        'role' => 'assistant',
                        'content' => 'Mensagem enviada! Agora é aguardar a resposta do lead.',
                        'tool_calls' => [],
                    ],
                ]],
            ], 200),
            'whatsapp.test/*' => Http::response(['success' => true], 200),
        ]);

        [$user, $connection] = $this->userConectado();
        $this->agentAtivo($user);
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'whatsapp_jid' => '5511999990000@c.us',
            'owner_id' => $user->id,
        ]);
        $this->inbound($user, $connection, $lead, 'Oi');

        $job = new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$lead->id);
        $this->runAiJob($job);

        $this->assertDatabaseMissing('whatsapp_messages', [
            'user_id' => $user->id,
            'direction' => 'outbound',
            'lead_id' => $lead->id,
        ]);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'whatsapp.test'));
    }

    public function test_texto_livre_cliente_e_enviado_como_fallback(): void
    {
        Http::fake([
            'openrouter.ai/*' => Http::response([
                'choices' => [[
                    'message' => [
                        'role' => 'assistant',
                        'content' => 'Claro! Sua visita está confirmada para amanhã às 10:00.',
                        'tool_calls' => [],
                    ],
                ]],
            ], 200),
            'whatsapp.test/*' => Http::response([
                'success' => true,
                'to' => '5511999990000@c.us',
                'messageId' => 'out-fallback',
            ], 200),
        ]);

        [$user, $connection] = $this->userConectado();
        $this->agentAtivo($user);
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'whatsapp_jid' => '5511999990000@c.us',
            'owner_id' => $user->id,
        ]);
        $this->inbound($user, $connection, $lead, 'Confirma?');

        $job = new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$lead->id);
        $this->runAiJob($job);

        $this->assertDatabaseHas('whatsapp_messages', [
            'user_id' => $user->id,
            'direction' => 'outbound',
            'body' => 'Claro! Sua visita está confirmada para amanhã às 10:00.',
            'lead_id' => $lead->id,
        ]);
    }

    public function test_criar_agendamento_cancela_pendente_anterior_do_lead(): void
    {
        $inicio = now()->addDay()->setTime(15, 0);
        $fim = $inicio->copy()->addHour();

        $openRouterCalls = 0;
        Http::fake(function ($request) use ($inicio, $fim, &$openRouterCalls) {
            $url = $request->url();
            if (str_contains($url, 'openrouter.ai')) {
                $openRouterCalls++;
                if ($openRouterCalls === 1) {
                    return Http::response([
                        'choices' => [[
                            'message' => [
                                'role' => 'assistant',
                                'content' => null,
                                'tool_calls' => [[
                                    'id' => 'call_ag',
                                    'type' => 'function',
                                    'function' => [
                                        'name' => 'criar_agendamento',
                                        'arguments' => json_encode([
                                            'titulo' => 'Visita remarcada',
                                            'inicio' => $inicio->toIso8601String(),
                                            'fim' => $fim->toIso8601String(),
                                        ], JSON_UNESCAPED_UNICODE),
                                    ],
                                ]],
                            ],
                        ]],
                    ], 200);
                }

                return Http::response([
                    'choices' => [[
                        'message' => [
                            'role' => 'assistant',
                            'content' => null,
                            'tool_calls' => [],
                        ],
                    ]],
                ], 200);
            }

            if (str_contains($url, 'oauth2')) {
                return Http::response([
                    'access_token' => 'atok',
                    'expires_in' => 3600,
                ], 200);
            }

            if ($request->method() === 'DELETE') {
                return Http::response(null, 204);
            }

            return Http::response([
                'id' => 'evt-new',
                'summary' => 'Visita remarcada',
                'htmlLink' => 'https://calendar.google.com/event?eid=2',
                'start' => ['dateTime' => $inicio->toIso8601String()],
                'end' => ['dateTime' => $fim->toIso8601String()],
            ], 200);
        });

        [$user, $connection] = $this->userConectado();
        $agent = $this->agentAtivo($user);
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'owner_id' => $user->id,
        ]);

        $oldTask = Task::create([
            'title' => 'Visita antiga',
            'due_at' => now()->addDay()->setTime(14, 0),
            'lead_id' => $lead->id,
            'user_id' => $user->id,
            'description' => 'event_id: evt-old',
        ]);
        Activity::create([
            'type' => 'task',
            'subject' => 'Agendamento criado pelo agent: Visita antiga',
            'lead_id' => $lead->id,
            'user_id' => $user->id,
            'meta' => [
                'task_id' => $oldTask->id,
                'google_event_id' => 'evt-old',
                'agent_id' => $agent->id,
            ],
        ]);

        $this->inbound($user, $connection, $lead, 'Pode ser às 15h em vez das 14h');

        $job = new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$lead->id);
        $this->runAiJob($job);

        $this->assertNotNull($oldTask->fresh()->done_at);
        $nova = Task::query()
            ->where('lead_id', $lead->id)
            ->where('title', 'Visita remarcada')
            ->latest('id')
            ->first();
        $this->assertNotNull($nova);
        $this->assertNull($nova->done_at);
    }

    public function test_listar_horarios_disponiveis_omite_titulos_e_so_retorna_livres(): void
    {
        $dia = now()->next(\Carbon\Carbon::MONDAY)->startOfDay();
        if ($dia->lte(now())) {
            $dia = now()->next(\Carbon\Carbon::TUESDAY)->startOfDay();
        }

        $openRouterCalls = 0;
        Http::fake(function ($request) use ($dia, &$openRouterCalls) {
            $url = $request->url();

            if (str_contains($url, 'openrouter.ai')) {
                $openRouterCalls++;
                if ($openRouterCalls === 1) {
                    return Http::response([
                        'choices' => [[
                            'message' => [
                                'role' => 'assistant',
                                'content' => null,
                                'tool_calls' => [[
                                    'id' => 'call_slots',
                                    'type' => 'function',
                                    'function' => [
                                        'name' => 'listar_horarios_disponiveis',
                                        'arguments' => json_encode([
                                            'data' => $dia->toDateString(),
                                            'dias' => 1,
                                            'duracao_minutos' => 60,
                                        ]),
                                    ],
                                ]],
                            ],
                        ]],
                    ], 200);
                }

                if ($openRouterCalls === 2) {
                    return Http::response([
                        'choices' => [[
                            'message' => [
                                'role' => 'assistant',
                                'content' => null,
                                'tool_calls' => [[
                                    'id' => 'call_send',
                                    'type' => 'function',
                                    'function' => [
                                        'name' => 'enviar_resposta',
                                        'arguments' => json_encode([
                                            'texto' => 'Tenho horários livres. Qual prefere?',
                                        ], JSON_UNESCAPED_UNICODE),
                                    ],
                                ]],
                            ],
                        ]],
                    ], 200);
                }

                return Http::response([
                    'choices' => [[
                        'message' => [
                            'role' => 'assistant',
                            'content' => null,
                            'tool_calls' => [],
                        ],
                    ]],
                ], 200);
            }

            if (str_contains($url, 'oauth2')) {
                return Http::response([
                    'access_token' => 'atok',
                    'expires_in' => 3600,
                ], 200);
            }

            if (str_contains($url, 'freeBusy')) {
                return Http::response([
                    'calendars' => [
                        'primary' => [
                            'busy' => [[
                                'start' => $dia->copy()->setTime(9, 0)->toIso8601String(),
                                'end' => $dia->copy()->setTime(10, 0)->toIso8601String(),
                            ]],
                        ],
                    ],
                ], 200);
            }

            return Http::response([
                'success' => true,
                'to' => '5511999990000@c.us',
                'messageId' => 'out-slots',
            ], 200);
        });

        [$user, $connection] = $this->userConectado();
        $this->agentAtivo($user);
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'whatsapp_jid' => '5511999990000@c.us',
            'owner_id' => $user->id,
        ]);
        $this->inbound($user, $connection, $lead, 'Quais horários você tem?');

        $job = new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$lead->id);
        $this->runAiJob($job);

        Http::assertSent(fn ($request) => str_contains($request->url(), 'freeBusy'));

        $this->assertDatabaseHas('whatsapp_messages', [
            'user_id' => $user->id,
            'direction' => 'outbound',
            'lead_id' => $lead->id,
        ]);
    }

    public function test_job_noop_quando_lead_pausado(): void
    {
        Http::fake();
        [$user, $connection] = $this->userConectado();
        $this->agentAtivo($user);
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'owner_id' => $user->id,
            'whatsapp_agent_paused_at' => now(),
        ]);
        $this->inbound($user, $connection, $lead);

        $job = new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$lead->id);
        $this->runAiJob($job);

        Http::assertNothingSent();
    }

    public function test_agent_usa_segmento_aberto_e_resumo_anterior_sem_replay_de_transferencia(): void
    {
        $captured = null;
        Http::fake(function ($request) use (&$captured) {
            if (str_contains($request->url(), 'openrouter.ai')) {
                $captured = $request->data();

                return Http::response([
                    'choices' => [[
                        'message' => [
                            'role' => 'assistant',
                            'content' => null,
                            'tool_calls' => [[
                                'id' => 'call_reply',
                                'type' => 'function',
                                'function' => [
                                    'name' => 'enviar_resposta',
                                    'arguments' => json_encode(['texto' => 'Oi! Como posso ajudar?']),
                                ],
                            ]],
                        ],
                    ]],
                ], 200);
            }

            return Http::response([
                'success' => true,
                'to' => '5511999990000@c.us',
                'messageId' => 'out-seg-1',
            ], 200);
        });

        [$user, $connection] = $this->userConectado();
        $this->agentAtivo($user);
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'whatsapp_jid' => '5511999990000@c.us',
            'owner_id' => $user->id,
        ]);

        $oldStart = now()->subHours(2);
        $oldEnd = now()->subHour();

        WhatsappAttendanceSegment::create([
            'clinic_id' => $lead->clinic_id,
            'lead_id' => $lead->id,
            'mode' => WhatsappAttendanceSegment::MODE_AI,
            'started_at' => $oldStart,
            'ended_at' => $oldEnd,
            'duration_seconds' => 3600,
            'source' => 'test',
            'ai_summary' => 'Cliente perguntou sobre clareamento; ficou de pensar.',
            'ai_summary_at' => $oldEnd,
        ]);

        WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $user->id,
            'session_id' => $connection->session_id,
            'whatsapp_jid' => '5511999990000@c.us',
            'phone_number' => '5511999990000',
            'direction' => 'inbound',
            'body' => 'Quero clareamento',
            'message_id' => 'msg-old-1',
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $lead->id,
            'wa_timestamp' => $oldStart->copy()->addMinutes(5),
        ]);

        WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $user->id,
            'session_id' => $connection->session_id,
            'whatsapp_jid' => '5511999990000@c.us',
            'direction' => 'outbound',
            'body' => '_transferindo chamado_',
            'message_id' => 'msg-old-transfer',
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $lead->id,
            'wa_timestamp' => $oldStart->copy()->addMinutes(10),
        ]);

        $openStart = now()->subMinutes(2);
        WhatsappAttendanceSegment::create([
            'clinic_id' => $lead->clinic_id,
            'lead_id' => $lead->id,
            'mode' => WhatsappAttendanceSegment::MODE_AI,
            'started_at' => $openStart,
            'ended_at' => null,
            'source' => 'reopen',
        ]);

        WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $user->id,
            'session_id' => $connection->session_id,
            'whatsapp_jid' => '5511999990000@c.us',
            'phone_number' => '5511999990000',
            'direction' => 'inbound',
            'body' => 'Oi, voltei',
            'message_id' => 'msg-new-1',
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $lead->id,
            'wa_timestamp' => $openStart->copy()->addMinute(),
        ]);

        $job = new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$lead->id);
        $this->runAiJob($job);

        $this->assertNotNull($captured);
        $messages = $captured['messages'] ?? [];
        $encoded = json_encode($messages, JSON_UNESCAPED_UNICODE);

        $this->assertStringContainsString('Oi, voltei', $encoded);
        $this->assertStringNotContainsString('transferindo chamado', $encoded);
        $this->assertStringNotContainsString('Quero clareamento', $encoded);
        $this->assertStringContainsString('Cliente perguntou sobre clareamento', $encoded);
        $this->assertStringContainsString('Histórico de atendimentos anteriores', $encoded);
    }

    public function test_agent_responde_inbound_que_reabre_com_wa_timestamp_anterior_ao_segmento(): void
    {
        $captured = null;
        Http::fake(function ($request) use (&$captured) {
            if (str_contains($request->url(), 'openrouter.ai')) {
                $captured = $request->data();

                return Http::response([
                    'choices' => [[
                        'message' => [
                            'role' => 'assistant',
                            'content' => null,
                            'tool_calls' => [[
                                'id' => 'call_reopen',
                                'type' => 'function',
                                'function' => [
                                    'name' => 'enviar_resposta',
                                    'arguments' => json_encode(['texto' => 'Oi! Como posso ajudar?']),
                                ],
                            ]],
                        ],
                    ]],
                ], 200);
            }

            return Http::response([
                'success' => true,
                'to' => '5511999990000@c.us',
                'messageId' => 'out-reopen-1',
            ], 200);
        });

        [$user, $connection] = $this->userConectado();
        $this->agentAtivo($user);
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'whatsapp_jid' => '5511999990000@c.us',
            'owner_id' => $user->id,
        ]);

        $openStart = now();
        WhatsappAttendanceSegment::create([
            'clinic_id' => $lead->clinic_id,
            'lead_id' => $lead->id,
            'mode' => WhatsappAttendanceSegment::MODE_AI,
            'started_at' => $openStart,
            'ended_at' => null,
            'source' => 'reopen',
        ]);

        WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $user->id,
            'session_id' => $connection->session_id,
            'whatsapp_jid' => '5511999990000@c.us',
            'phone_number' => '5511999990000',
            'direction' => 'inbound',
            'body' => 'Oiii',
            'message_id' => 'msg-reopen-skew',
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $lead->id,
            'wa_timestamp' => $openStart->copy()->subSeconds(2),
            'created_at' => $openStart,
            'updated_at' => $openStart,
        ]);

        $job = new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$lead->id);
        $this->runAiJob($job);

        $this->assertNotNull($captured);
        $encoded = json_encode($captured['messages'] ?? [], JSON_UNESCAPED_UNICODE);
        $this->assertStringContainsString('Oiii', $encoded);
        $this->assertDatabaseHas('whatsapp_messages', [
            'connection_id' => $connection->id,
            'direction' => 'outbound',
            'lead_id' => $lead->id,
        ]);
    }

    public function test_job_nao_falha_quando_historico_do_segmento_nao_tem_conteudo(): void
    {
        Http::fake();

        [$user, $connection] = $this->userConectado();
        $this->agentAtivo($user);
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'whatsapp_jid' => '5511999990000@c.us',
            'owner_id' => $user->id,
        ]);

        WhatsappAttendanceSegment::create([
            'clinic_id' => $lead->clinic_id,
            'lead_id' => $lead->id,
            'mode' => WhatsappAttendanceSegment::MODE_AI,
            'started_at' => now(),
            'ended_at' => null,
            'source' => 'reopen',
        ]);

        WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $user->id,
            'session_id' => $connection->session_id,
            'whatsapp_jid' => '5511999990000@c.us',
            'direction' => 'inbound',
            'body' => 'msg antiga',
            'message_id' => 'msg-old-only',
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $lead->id,
            'wa_timestamp' => now()->subHours(2),
            'created_at' => now()->subHours(2),
            'updated_at' => now()->subHours(2),
        ]);

        $job = new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$lead->id);
        $this->runAiJob($job);

        Http::assertNothingSent();
    }
}
