<?php

namespace Tests\Feature;

use App\Models\LlmTokenUsage;
use App\Models\OutboundHttpLog;
use App\Models\SystemSetting;
use App\Models\User;
use Database\Seeders\ClinicSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DevApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ClinicSeeder::class);
    }

    public function test_developer_acessa_tokens_logs_e_settings(): void
    {
        Sanctum::actingAs(User::factory()->developer()->create());

        LlmTokenUsage::query()->create([
            'provider' => 'openrouter',
            'purpose' => LlmTokenUsage::PURPOSE_AGENT_CHAT,
            'model' => 'test/model',
            'prompt_tokens' => 10,
            'completion_tokens' => 5,
            'total_tokens' => 15,
            'cost' => 0.0125,
            'created_at' => now(),
        ]);

        $log = OutboundHttpLog::query()->create([
            'provider' => 'openrouter',
            'method' => 'POST',
            'url' => 'https://openrouter.ai/api/v1/chat/completions',
            'response_status' => 200,
            'duration_ms' => 120,
            'created_at' => now(),
        ]);

        $this->getJson('/api/v1/dev/tokens/stats')
            ->assertOk()
            ->assertJsonPath('data.totals.total_tokens', 15)
            ->assertJsonPath('data.totals.cost', 0.0125);

        $this->getJson('/api/v1/dev/logs')
            ->assertOk()
            ->assertJsonFragment(['id' => $log->id]);

        $this->getJson('/api/v1/dev/logs/'.$log->id)
            ->assertOk()
            ->assertJsonPath('data.id', $log->id);

        $this->getJson('/api/v1/dev/settings')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    SystemSetting::KEY_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT,
                    SystemSetting::KEY_OPENROUTER_TRANSCRIPTION_MODEL,
                    SystemSetting::KEY_OPENROUTER_TRANSCRIPTION_LANGUAGE,
                    SystemSetting::KEY_OPENROUTER_VISION_MODEL,
                    SystemSetting::KEY_OPENROUTER_VISION_SYSTEM_PROMPT,
                    SystemSetting::KEY_OPENROUTER_VISION_INSTRUCTION,
                    SystemSetting::KEY_WHATSAPP_MEDIA_RETENTION_DAYS,
                    SystemSetting::KEY_WHATSAPP_MEDIA_MAX_MB_PER_CLINIC,
                ],
            ]);
    }

    public function test_settings_de_midia_caem_no_default_do_env(): void
    {
        config([
            'services.openrouter.transcription_model' => 'openai/whisper-1',
            'services.openrouter.transcription_language' => 'pt',
            'services.openrouter.vision_model' => 'openai/gpt-4o-mini',
        ]);

        Sanctum::actingAs(User::factory()->developer()->create());

        $this->getJson('/api/v1/dev/settings')
            ->assertOk()
            ->assertJsonPath('data.'.SystemSetting::KEY_OPENROUTER_TRANSCRIPTION_MODEL, 'openai/whisper-1')
            ->assertJsonPath('data.'.SystemSetting::KEY_OPENROUTER_TRANSCRIPTION_LANGUAGE, 'pt')
            ->assertJsonPath('data.'.SystemSetting::KEY_OPENROUTER_VISION_MODEL, 'openai/gpt-4o-mini')
            ->assertJsonPath(
                'data.'.SystemSetting::KEY_OPENROUTER_VISION_SYSTEM_PROMPT,
                SystemSetting::DEFAULT_OPENROUTER_VISION_SYSTEM_PROMPT,
            )
            ->assertJsonPath(
                'data.'.SystemSetting::KEY_OPENROUTER_VISION_INSTRUCTION,
                SystemSetting::DEFAULT_OPENROUTER_VISION_INSTRUCTION,
            );
    }

    public function test_developer_atualiza_modelos_de_midia(): void
    {
        Sanctum::actingAs(User::factory()->developer()->create());

        $this->putJson('/api/v1/dev/settings', [
            SystemSetting::KEY_OPENROUTER_TRANSCRIPTION_MODEL => 'openai/whisper-large-v3',
            SystemSetting::KEY_OPENROUTER_TRANSCRIPTION_LANGUAGE => 'pt',
            SystemSetting::KEY_OPENROUTER_VISION_MODEL => 'google/gemini-2.0-flash-001',
        ])
            ->assertOk()
            ->assertJsonPath('data.'.SystemSetting::KEY_OPENROUTER_TRANSCRIPTION_MODEL, 'openai/whisper-large-v3')
            ->assertJsonPath('data.'.SystemSetting::KEY_OPENROUTER_VISION_MODEL, 'google/gemini-2.0-flash-001');

        $this->assertDatabaseHas('system_settings', [
            'key' => SystemSetting::KEY_OPENROUTER_VISION_MODEL,
            'value' => 'google/gemini-2.0-flash-001',
        ]);
    }

    public function test_lista_modelos_de_transcricao_e_visao_por_capacidade(): void
    {
        Sanctum::actingAs(User::factory()->developer()->create());

        Http::fake([
            'openrouter.ai/api/v1/models*' => Http::response([
                'data' => [
                    [
                        'id' => 'openai/whisper-1',
                        'name' => 'Whisper',
                        'architecture' => [
                            'input_modalities' => ['audio'],
                            'output_modalities' => ['transcription'],
                        ],
                    ],
                    [
                        'id' => 'openai/gpt-4o-mini',
                        'name' => 'GPT-4o Mini',
                        'architecture' => [
                            'input_modalities' => ['text', 'image'],
                            'output_modalities' => ['text'],
                        ],
                    ],
                    [
                        'id' => 'meta/llama-texto',
                        'name' => 'Llama Texto',
                        'architecture' => [
                            'input_modalities' => ['text'],
                            'output_modalities' => ['text'],
                        ],
                    ],
                ],
            ], 200),
        ]);

        $this->getJson('/api/v1/dev/openrouter-models?capability=transcription')
            ->assertOk()
            ->assertJsonPath('data.capability', 'transcription')
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.models.0.id', 'openai/whisper-1');

        $this->getJson('/api/v1/dev/openrouter-models?capability=vision')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.models.0.id', 'openai/gpt-4o-mini');

        Http::assertSent(function ($request) {
            $query = [];
            $qs = parse_url($request->url(), PHP_URL_QUERY);
            if (is_string($qs)) {
                parse_str($qs, $query);
            }

            return ($query['output_modalities'] ?? null) === 'transcription'
                || ($query['input_modalities'] ?? null) === 'image';
        });
    }

    public function test_lista_modelos_recusa_capacidade_invalida(): void
    {
        Sanctum::actingAs(User::factory()->developer()->create());

        $this->getJson('/api/v1/dev/openrouter-models?capability=audio')->assertStatus(422);
    }

    public function test_valida_idioma_e_modelo_de_midia(): void
    {
        Sanctum::actingAs(User::factory()->developer()->create());

        $this->putJson('/api/v1/dev/settings', [
            SystemSetting::KEY_OPENROUTER_TRANSCRIPTION_LANGUAGE => 'português',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(SystemSetting::KEY_OPENROUTER_TRANSCRIPTION_LANGUAGE);

        $this->putJson('/api/v1/dev/settings', [
            SystemSetting::KEY_OPENROUTER_VISION_MODEL => 'modelo inválido!',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(SystemSetting::KEY_OPENROUTER_VISION_MODEL);

        $this->putJson('/api/v1/dev/settings', [
            SystemSetting::KEY_WHATSAPP_MEDIA_RETENTION_DAYS => 0,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(SystemSetting::KEY_WHATSAPP_MEDIA_RETENTION_DAYS);
    }

    public function test_developer_atualiza_retencao_de_midia(): void
    {
        Sanctum::actingAs(User::factory()->developer()->create());

        $this->putJson('/api/v1/dev/settings', [
            SystemSetting::KEY_WHATSAPP_MEDIA_RETENTION_DAYS => 60,
            SystemSetting::KEY_WHATSAPP_MEDIA_MAX_MB_PER_CLINIC => 1024,
        ])
            ->assertOk()
            ->assertJsonPath('data.'.SystemSetting::KEY_WHATSAPP_MEDIA_RETENTION_DAYS, '60')
            ->assertJsonPath('data.'.SystemSetting::KEY_WHATSAPP_MEDIA_MAX_MB_PER_CLINIC, '1024');
    }

    public function test_developer_atualiza_prompts_de_visao(): void
    {
        Sanctum::actingAs(User::factory()->developer()->create());

        $system = 'Descreva imagens de exames odontológicos em português, sem diagnóstico.';
        $instruction = 'O que aparece nesta foto?';

        $this->putJson('/api/v1/dev/settings', [
            SystemSetting::KEY_OPENROUTER_VISION_SYSTEM_PROMPT => $system,
            SystemSetting::KEY_OPENROUTER_VISION_INSTRUCTION => $instruction,
        ])
            ->assertOk()
            ->assertJsonPath('data.'.SystemSetting::KEY_OPENROUTER_VISION_SYSTEM_PROMPT, $system)
            ->assertJsonPath('data.'.SystemSetting::KEY_OPENROUTER_VISION_INSTRUCTION, $instruction);

        $this->assertDatabaseHas('system_settings', [
            'key' => SystemSetting::KEY_OPENROUTER_VISION_SYSTEM_PROMPT,
            'value' => $system,
        ]);
    }

    public function test_developer_atualiza_prompt_de_anotacoes(): void
    {
        Sanctum::actingAs(User::factory()->developer()->create());

        $prompt = "Prompt atualizado para anotações IA.\nBullets curtos e factuais.";

        $this->putJson('/api/v1/dev/settings', [
            SystemSetting::KEY_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT => $prompt,
        ])
            ->assertOk()
            ->assertJsonPath(
                'data.'.SystemSetting::KEY_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT,
                $prompt,
            );

        $this->assertDatabaseHas('system_settings', [
            'key' => SystemSetting::KEY_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT,
            'value' => $prompt,
        ]);
    }

    public function test_admin_e_funcionario_nao_acessam_dev_api(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $this->getJson('/api/v1/dev/tokens/stats')->assertForbidden();
        $this->getJson('/api/v1/dev/settings')->assertForbidden();

        Sanctum::actingAs(User::factory()->funcionario()->create());
        $this->getJson('/api/v1/dev/logs')->assertForbidden();
        $this->putJson('/api/v1/dev/settings', [
            SystemSetting::KEY_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT => 'x',
        ])->assertForbidden();
    }
}
