<?php

namespace Tests\Feature;

use App\Jobs\Crm\ProcessWhatsappAiReplyJob;
use App\Models\Crm\Agent;
use App\Models\Crm\ClinicService;
use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ClinicServicesCatalogTest extends TestCase
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
        $this->seedClinicServices();
    }

    public function test_api_services_filtra_por_nome(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $response = $this->getJson('/api/v1/crm/services?q=limpeza')
            ->assertOk();

        $services = $response->json('data');
        $this->assertNotEmpty($services);
        foreach ($services as $service) {
            $hay = mb_strtolower(($service['name'] ?? '').' '.($service['code'] ?? ''));
            $this->assertTrue(str_contains($hay, 'limpeza'));
        }
    }

    public function test_tool_consultar_servicos_via_agent(): void
    {
        Http::fake([
            'openrouter.ai/*' => Http::sequence()
                ->push([
                    'choices' => [[
                        'message' => [
                            'role' => 'assistant',
                            'content' => null,
                            'tool_calls' => [[
                                'id' => 'call_svc',
                                'type' => 'function',
                                'function' => [
                                    'name' => 'consultar_servicos',
                                    'arguments' => json_encode([
                                        'nome' => 'limpeza',
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
                                        'texto' => 'Sim, fazemos limpeza. Quer agendar?',
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
                'messageId' => 'out-svc',
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
            'body' => 'Vocês fazem limpeza?',
            'message_id' => 'in-svc-1',
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
            'body' => 'Sim, fazemos limpeza. Quer agendar?',
            'lead_id' => $lead->id,
        ]);
    }

    private function seedClinicServices(): void
    {
        $clinic = $this->defaultClinic();

        ClinicService::query()->create([
            'clinic_id' => $clinic->id,
            'code' => 'ODO-LIMPEZA',
            'name' => 'Profilaxia / limpeza',
            'duration_minutes' => 45,
            'price_particular_min' => 120,
            'price_particular_max' => 220,
            'accepts_insurance' => true,
            'description' => 'Limpeza dental profissional',
        ]);

        ClinicService::query()->create([
            'clinic_id' => $clinic->id,
            'code' => 'ODO-CLAREAM',
            'name' => 'Clareamento dental',
            'duration_minutes' => 90,
            'price_particular_min' => 800,
            'price_particular_max' => 1500,
            'accepts_insurance' => false,
            'description' => null,
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
