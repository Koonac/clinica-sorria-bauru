<?php

namespace Tests\Feature;

use App\Jobs\Crm\ProcessWhatsappAiReplyJob;
use App\Models\Crm\Agent;
use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use App\Services\Crm\Agent\WhatsappAgentRunner;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FaixasPrecosClinicasApiTest extends TestCase
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
        ]);
    }

    public function test_api_faixas_precos_filtra_por_categoria(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $response = $this->getJson('/api/v1/crm/faixas-precos?categoria=energia_solar&consumo_kwh_mes=500')
            ->assertOk()
            ->assertJsonPath('data.mock', true);

        $faixas = $response->json('data.faixas');
        $this->assertNotEmpty($faixas);
        foreach ($faixas as $faixa) {
            $this->assertSame('energia_solar', $faixa['categoria']);
        }
    }

    public function test_api_faixa_preco_detalhe(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/v1/crm/faixas-precos/prc-004')
            ->assertOk()
            ->assertJsonPath('data.faixa.categoria', 'protecao_veicular');
    }

    public function test_api_clinicas_filtra_procedimento_e_convenio(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $response = $this->getJson('/api/v1/crm/clinicas?tipo=odontologica&procedimento=limpeza&convenio=OdontoPrev')
            ->assertOk()
            ->assertJsonPath('data.mock', true);

        $clinicas = $response->json('data.clinicas');
        $this->assertNotEmpty($clinicas);
        foreach ($clinicas as $cli) {
            $this->assertSame('odontologica', $cli['tipo']);
            $this->assertTrue(collect($cli['convenios'])->contains(
                fn ($c) => str_contains(mb_strtolower($c), 'odontoprev')
            ));
        }
    }

    public function test_api_clinica_detalhe(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/v1/crm/clinicas/cli-001')
            ->assertOk()
            ->assertJsonPath('data.clinica.tipo', 'estetica')
            ->assertJsonStructure(['data' => ['clinica' => ['procedimentos', 'medicos', 'convenios']]]);
    }

    public function test_tool_consultar_faixas_precos_via_agent(): void
    {
        Http::fake([
            'openrouter.ai/*' => Http::sequence()
                ->push([
                    'choices' => [[
                        'message' => [
                            'role' => 'assistant',
                            'content' => null,
                            'tool_calls' => [[
                                'id' => 'call_prc',
                                'type' => 'function',
                                'function' => [
                                    'name' => 'consultar_faixas_precos',
                                    'arguments' => json_encode([
                                        'categoria' => 'moveis_planejados',
                                        'ambiente' => 'cozinha',
                                    ]),
                                ],
                            ]],
                        ],
                    ]],
                ])
                ->push([
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
                                        'texto' => 'Para cozinha planejada, a faixa estimada fica entre R$ 12 mil e R$ 28 mil.',
                                    ], JSON_UNESCAPED_UNICODE),
                                ],
                            ]],
                        ],
                    ]],
                ])
                ->push([
                    'choices' => [[
                        'message' => [
                            'role' => 'assistant',
                            'content' => null,
                            'tool_calls' => [],
                        ],
                    ]],
                ]),
            'whatsapp.test/*' => Http::response([
                'success' => true,
                'to' => '5511999990000@c.us',
                'messageId' => 'out-prc',
            ], 200),
        ]);

        [$user, $lead] = $this->userLeadAgent();
        WhatsappMessage::create([
            'user_id' => $user->id,
            'session_id' => 'sess-1',
            'whatsapp_jid' => '5511999990000@c.us',
            'phone_number' => '5511999990000',
            'direction' => 'inbound',
            'body' => 'Quanto custa uma cozinha planejada?',
            'message_id' => 'in-prc-1',
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $lead->id,
            'wa_timestamp' => now(),
        ]);

        $job = new ProcessWhatsappAiReplyJob($user->id, 'lead:'.$lead->id);
        $job->handle(app(WhatsappAgentRunner::class), app(\App\Services\Crm\WhatsappChatHistory::class));

        $this->assertDatabaseHas('whatsapp_messages', [
            'user_id' => $user->id,
            'direction' => 'outbound',
            'lead_id' => $lead->id,
        ]);
    }

    public function test_tool_consultar_clinicas_via_agent(): void
    {
        Http::fake([
            'openrouter.ai/*' => Http::sequence()
                ->push([
                    'choices' => [[
                        'message' => [
                            'role' => 'assistant',
                            'content' => null,
                            'tool_calls' => [[
                                'id' => 'call_cli',
                                'type' => 'function',
                                'function' => [
                                    'name' => 'consultar_clinicas',
                                    'arguments' => json_encode([
                                        'tipo' => 'odontologica',
                                        'convenio' => 'OdontoPrev',
                                        'procedimento' => 'limpeza',
                                    ]),
                                ],
                            ]],
                        ],
                    ]],
                ])
                ->push([
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
                                        'texto' => 'Sim, atendemos limpeza com OdontoPrev. Quer agendar?',
                                    ], JSON_UNESCAPED_UNICODE),
                                ],
                            ]],
                        ],
                    ]],
                ])
                ->push([
                    'choices' => [[
                        'message' => [
                            'role' => 'assistant',
                            'content' => null,
                            'tool_calls' => [],
                        ],
                    ]],
                ]),
            'whatsapp.test/*' => Http::response([
                'success' => true,
                'to' => '5511999990000@c.us',
                'messageId' => 'out-cli',
            ], 200),
        ]);

        [$user, $lead] = $this->userLeadAgent();
        WhatsappMessage::create([
            'user_id' => $user->id,
            'session_id' => 'sess-1',
            'whatsapp_jid' => '5511999990000@c.us',
            'phone_number' => '5511999990000',
            'direction' => 'inbound',
            'body' => 'Vocês fazem limpeza com OdontoPrev?',
            'message_id' => 'in-cli-1',
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $lead->id,
            'wa_timestamp' => now(),
        ]);

        $job = new ProcessWhatsappAiReplyJob($user->id, 'lead:'.$lead->id);
        $job->handle(app(WhatsappAgentRunner::class), app(\App\Services\Crm\WhatsappChatHistory::class));

        $this->assertDatabaseHas('whatsapp_messages', [
            'user_id' => $user->id,
            'direction' => 'outbound',
            'body' => 'Sim, atendemos limpeza com OdontoPrev. Quer agendar?',
            'lead_id' => $lead->id,
        ]);
    }

    /**
     * @return array{0: User, 1: Lead}
     */
    private function userLeadAgent(): array
    {
        $user = User::factory()->create([
            'whatsapp_status' => 'connected',
            'whatsapp_session_id' => 'sess-1',
            'whatsapp_api_username' => 'u',
            'whatsapp_api_password' => 'p',
        ]);
        Agent::create([
            'user_id' => $user->id,
            'name' => 'Bot',
            'system_prompt' => 'Atenda.',
            'debounce_seconds' => 5,
            'is_active' => true,
        ]);
        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'whatsapp_jid' => '5511999990000@c.us',
            'owner_id' => $user->id,
        ]);

        return [$user, $lead];
    }
}
