<?php

namespace Tests\Feature;

use App\Jobs\Crm\ProcessWhatsappAiReplyJob;
use App\Models\Crm\Agent;
use App\Models\Crm\Lead;
use App\Models\User;
use App\Services\Crm\Agent\WhatsappAgentRunner;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ImoveisApiTest extends TestCase
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

    public function test_api_lista_imoveis_mock_com_filtros(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $response = $this->getJson('/api/v1/crm/imoveis?bairro=Jardim%20Contorno&finalidade=venda&limite=10')
            ->assertOk()
            ->assertJsonPath('data.mock', true)
            ->assertJsonPath('data.ok', true);

        $imoveis = $response->json('data.imoveis');
        $this->assertIsArray($imoveis);
        $this->assertNotEmpty($imoveis);
        foreach ($imoveis as $imo) {
            $this->assertStringContainsStringIgnoringCase('Contorno', $imo['bairro']);
            $this->assertSame('venda', $imo['finalidade']);
            $this->assertNotEmpty($imo['imagens']);
        }
    }

    public function test_api_detalhe_por_codigo(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/v1/crm/imoveis/APT-102')
            ->assertOk()
            ->assertJsonPath('data.imovel.codigo', 'APT-102')
            ->assertJsonPath('data.mock', true);
    }

    public function test_api_404_quando_inexistente(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/v1/crm/imoveis/XYZ-999')->assertNotFound();
    }

    public function test_tool_consultar_imoveis_via_agent(): void
    {
        Http::fake([
            'openrouter.ai/*' => Http::sequence()
                ->push([
                    'choices' => [[
                        'message' => [
                            'role' => 'assistant',
                            'content' => null,
                            'tool_calls' => [[
                                'id' => 'call_imo',
                                'type' => 'function',
                                'function' => [
                                    'name' => 'consultar_imoveis',
                                    'arguments' => json_encode([
                                        'bairro' => 'Jardim Contorno',
                                        'quartos_min' => 2,
                                        'limite' => 3,
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
                                        'texto' => 'Encontrei opções no Jardim Contorno. Quer que eu te mostre?',
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
                'messageId' => 'out-imo',
            ], 200),
        ]);

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

        \App\Models\Crm\WhatsappMessage::create([
            'user_id' => $user->id,
            'session_id' => 'sess-1',
            'whatsapp_jid' => '5511999990000@c.us',
            'phone_number' => '5511999990000',
            'direction' => 'inbound',
            'body' => 'Tem apto 2 quartos no Contorno?',
            'message_id' => 'in-imo-1',
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
            'body' => 'Encontrei opções no Jardim Contorno. Quer que eu te mostre?',
        ]);
    }
}
