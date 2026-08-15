<?php

namespace Tests\Feature;

use App\Jobs\Crm\ProcessWhatsappAiReplyJob;
use App\Models\Crm\Agent;
use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ClinicasApiTest extends TestCase
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

        [$user, $lead, $connection] = $this->userLeadAgent();
        WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
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

        $job = new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$lead->id);
        $this->app->call([$job, 'handle']);

        $this->assertDatabaseHas('whatsapp_messages', [
            'user_id' => $user->id,
            'direction' => 'outbound',
            'body' => 'Sim, atendemos limpeza com OdontoPrev. Quer agendar?',
            'lead_id' => $lead->id,
        ]);
    }

    /**
     * @return array{0: User, 1: Lead, 2: \App\Models\Crm\Connection}
     */
    private function userLeadAgent(): array
    {
        [$user, $connection] = $this->userWithWhatsappConnection();
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

        return [$user, $lead, $connection];
    }
}
