<?php

namespace Tests\Feature;

use App\Jobs\Crm\ProcessWhatsappAiReplyJob;
use App\Models\Crm\Agent;
use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappMessage;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\Crm\EnrichWhatsappInboundMedia;
use App\Services\Crm\WhatsappMediaStore;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WhatsappMediaTest extends TestCase
{
    use RefreshDatabase;

    private const AUDIO_BYTES = 'ogg-fake-bytes';

    private const IMAGE_BYTES = 'png-fake-bytes';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CrmSeeder::class);
        Storage::fake('local');
        config([
            'services.openrouter.key' => 'test-key',
            'services.openrouter.agent_model' => 'openai/gpt-4o-mini',
            'services.openrouter.transcription_model' => 'openai/whisper-1',
            'services.openrouter.vision_model' => 'openai/gpt-4o-mini',
            'services.whatsapp.url' => 'http://whatsapp.test',
        ]);
    }

    /**
     * @return array{0: User, 1: Connection}
     */
    private function userConectado(): array
    {
        return $this->userWithWhatsappConnection();
    }

    private function leadComWhatsapp(User $user, array $extra = []): Lead
    {
        return Lead::create(array_merge([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'whatsapp_jid' => '5511999990000@c.us',
            'owner_id' => $user->id,
        ], $extra));
    }

    private function agentAtivo(User $user): Agent
    {
        return Agent::create([
            'user_id' => $user->id,
            'name' => 'Bot',
            'system_prompt' => 'Atenda com educação.',
            'debounce_seconds' => 5,
            'is_active' => true,
        ]);
    }

    /**
     * Mensagem inbound com mídia já persistida em disco.
     */
    private function inboundComMidia(
        User $user,
        Connection $connection,
        Lead $lead,
        string $type,
        string $mimetype,
        string $bytes,
        ?string $body = null,
    ): WhatsappMessage {
        $message = WhatsappMessage::create([
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
            'type' => $type,
            'has_media' => true,
            'lead_id' => $lead->id,
            'wa_timestamp' => now(),
        ]);

        $store = app(WhatsappMediaStore::class);
        $message->forceFill([
            'media' => $store->store($message, base64_encode($bytes), [
                'mimetype' => $mimetype,
                'filename' => $type === 'image' ? 'foto.png' : 'audio.ogg',
            ]),
        ])->save();

        return $message->fresh();
    }

    public function test_webhook_inbound_com_imagem_grava_arquivo_e_nao_guarda_base64(): void
    {
        [$user, $connection] = $this->userConectado();
        $this->leadComWhatsapp($user);

        $this->postJson(
            '/api/v1/crm/whatsapp/webhooks/messages?token='.$connection->webhook_token,
            [
                'event' => 'message',
                'session_id' => 'sess-1',
                'data' => [
                    'jid' => '5511999990000@c.us',
                    'phone_number' => '5511999990000',
                    'contact_name' => 'Ana',
                    'body' => '',
                    'from_me' => false,
                    'is_group' => false,
                    'is_broadcast' => false,
                    'message_id' => 'false_5511999990000@c.us_IMG1',
                    'type' => 'image',
                    'has_media' => true,
                    'media' => [
                        'mimetype' => 'image/png',
                        'data' => base64_encode(self::IMAGE_BYTES),
                        'filename' => 'foto.png',
                        'filesize' => strlen(self::IMAGE_BYTES),
                    ],
                    'timestamp' => now()->timestamp,
                ],
            ],
        )->assertOk();

        $message = WhatsappMessage::query()
            ->where('message_id', 'false_5511999990000@c.us_IMG1')
            ->firstOrFail();

        $this->assertTrue($message->has_media);
        $this->assertArrayNotHasKey('data', (array) $message->media);
        $this->assertSame('image/png', $message->mediaMimetype());

        $path = $message->mediaPath();
        $this->assertNotNull($path);
        Storage::disk('local')->assertExists($path);
        $this->assertSame(self::IMAGE_BYTES, Storage::disk('local')->get($path));
    }

    public function test_listagem_de_mensagens_expoe_media_url_sem_bytes(): void
    {
        [$user, $connection] = $this->userConectado();
        $lead = $this->leadComWhatsapp($user);
        $message = $this->inboundComMidia(
            $user,
            $connection,
            $lead,
            'image',
            'image/png',
            self::IMAGE_BYTES,
        );

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/v1/crm/whatsapp/messages?lead_id='.$lead->id)->assertOk();

        $payload = $response->json('data.0');
        $this->assertSame('/v1/crm/whatsapp/messages/'.$message->id.'/media', $payload['media_url']);
        $this->assertArrayNotHasKey('data', $payload['media']);
        $this->assertStringNotContainsString(base64_encode(self::IMAGE_BYTES), $response->getContent());
    }

    public function test_endpoint_de_media_exige_autenticacao_e_devolve_bytes(): void
    {
        [$user, $connection] = $this->userConectado();
        $lead = $this->leadComWhatsapp($user);
        $message = $this->inboundComMidia(
            $user,
            $connection,
            $lead,
            'image',
            'image/png',
            self::IMAGE_BYTES,
        );

        $url = '/api/v1/crm/whatsapp/messages/'.$message->id.'/media';

        $this->getJson($url)->assertUnauthorized();

        Sanctum::actingAs($user);

        $response = $this->get($url)->assertOk();
        $this->assertSame('image/png', $response->headers->get('Content-Type'));
        $this->assertSame(self::IMAGE_BYTES, $response->streamedContent());
    }

    public function test_endpoint_de_media_404_quando_nao_ha_arquivo(): void
    {
        [$user, $connection] = $this->userConectado();
        $lead = $this->leadComWhatsapp($user);

        $message = WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $user->id,
            'session_id' => 'sess-1',
            'whatsapp_jid' => '5511999990000@c.us',
            'direction' => 'inbound',
            'body' => null,
            'message_id' => 'sem-arquivo',
            'type' => 'image',
            'has_media' => true,
            'media' => ['mimetype' => 'image/png', 'omitted' => true],
            'lead_id' => $lead->id,
            'wa_timestamp' => now(),
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/crm/whatsapp/messages/'.$message->id.'/media')->assertNotFound();
    }

    public function test_enrich_transcreve_audio_e_preenche_body(): void
    {
        Http::fake([
            'openrouter.ai/api/v1/audio/transcriptions' => Http::response([
                'text' => 'Bom dia, gostaria de marcar uma limpeza.',
                'usage' => ['prompt_tokens' => 10, 'completion_tokens' => 5, 'total_tokens' => 15],
            ], 200),
        ]);

        [$user, $connection] = $this->userConectado();
        $lead = $this->leadComWhatsapp($user);
        $message = $this->inboundComMidia(
            $user,
            $connection,
            $lead,
            'ptt',
            'audio/ogg; codecs=opus',
            self::AUDIO_BYTES,
        );

        $texto = app(EnrichWhatsappInboundMedia::class)->handle($message);

        $this->assertSame('Bom dia, gostaria de marcar uma limpeza.', $texto);

        $fresh = $message->fresh();
        $this->assertSame('Bom dia, gostaria de marcar uma limpeza.', $fresh->body);
        $this->assertSame('Bom dia, gostaria de marcar uma limpeza.', $fresh->mediaTranscript());
        $this->assertNotNull($fresh->media['enriched_at'] ?? null);

        Http::assertSent(function ($request) {
            return $request->url() === 'https://openrouter.ai/api/v1/audio/transcriptions'
                && $request['model'] === 'openai/whisper-1'
                && $request['input_audio']['format'] === 'ogg'
                && $request['input_audio']['data'] === base64_encode(self::AUDIO_BYTES);
        });

        $this->assertDatabaseHas('llm_token_usages', ['purpose' => 'media_transcription']);
    }

    public function test_enrich_usa_modelo_configurado_no_painel_dev(): void
    {
        Http::fake([
            'openrouter.ai/api/v1/audio/transcriptions' => Http::response(['text' => 'Oi, tudo bem?'], 200),
        ]);

        SystemSetting::query()->create([
            'key' => SystemSetting::KEY_OPENROUTER_TRANSCRIPTION_MODEL,
            'value' => 'openai/whisper-large-v3',
        ]);
        SystemSetting::query()->create([
            'key' => SystemSetting::KEY_OPENROUTER_TRANSCRIPTION_LANGUAGE,
            'value' => 'es',
        ]);

        [$user, $connection] = $this->userConectado();
        $lead = $this->leadComWhatsapp($user);
        $message = $this->inboundComMidia(
            $user,
            $connection,
            $lead,
            'ptt',
            'audio/ogg',
            self::AUDIO_BYTES,
        );

        app(EnrichWhatsappInboundMedia::class)->handle($message);

        Http::assertSent(function ($request) {
            return $request['model'] === 'openai/whisper-large-v3'
                && $request['language'] === 'es';
        });
    }

    public function test_enrich_descreve_imagem_e_preserva_legenda(): void
    {
        Http::fake([
            'openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['role' => 'assistant', 'content' => 'Radiografia panorâmica dos dentes.'],
                ]],
            ], 200),
        ]);

        [$user, $connection] = $this->userConectado();
        $lead = $this->leadComWhatsapp($user);
        $message = $this->inboundComMidia(
            $user,
            $connection,
            $lead,
            'image',
            'image/png',
            self::IMAGE_BYTES,
            'Olha o resultado do meu exame',
        );

        app(EnrichWhatsappInboundMedia::class)->handle($message);

        $fresh = $message->fresh();
        $this->assertSame('Olha o resultado do meu exame', $fresh->body);
        $this->assertSame('Radiografia panorâmica dos dentes.', $fresh->mediaDescription());
        $this->assertStringContainsString('Olha o resultado do meu exame', $fresh->textForAgent());
        $this->assertStringContainsString('Radiografia panorâmica dos dentes.', $fresh->textForAgent());

        Http::assertSent(function ($request) {
            $content = $request['messages'][1]['content'] ?? [];

            return $request->url() === 'https://openrouter.ai/api/v1/chat/completions'
                && ($content[1]['type'] ?? null) === 'image_url'
                && str_starts_with((string) ($content[1]['image_url']['url'] ?? ''), 'data:image/png;base64,');
        });
    }

    public function test_enrich_marca_falha_e_nao_repete_chamada(): void
    {
        Http::fake([
            'openrouter.ai/*' => Http::response(['error' => ['message' => 'indisponível']], 500),
        ]);

        [$user, $connection] = $this->userConectado();
        $lead = $this->leadComWhatsapp($user);
        $message = $this->inboundComMidia(
            $user,
            $connection,
            $lead,
            'ptt',
            'audio/ogg',
            self::AUDIO_BYTES,
        );

        $enrich = app(EnrichWhatsappInboundMedia::class);

        $this->assertNull($enrich->handle($message));
        $fresh = $message->fresh();
        $this->assertNull($fresh->body);
        $this->assertNotNull($fresh->media['enrich_failed_at'] ?? null);
        $this->assertFalse($enrich->shouldEnrich($fresh));

        Http::assertSentCount(1);
    }

    public function test_job_transcreve_audio_antes_de_responder(): void
    {
        Http::fake([
            'openrouter.ai/api/v1/audio/transcriptions' => Http::response([
                'text' => 'Quero agendar uma avaliação.',
            ], 200),
            'openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'role' => 'assistant',
                        'content' => null,
                        'tool_calls' => [[
                            'id' => 'call_1',
                            'type' => 'function',
                            'function' => [
                                'name' => 'enviar_resposta',
                                'arguments' => json_encode(['texto' => 'Claro! Qual o melhor dia?'], JSON_UNESCAPED_UNICODE),
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
        $lead = $this->leadComWhatsapp($user);
        $message = $this->inboundComMidia(
            $user,
            $connection,
            $lead,
            'ptt',
            'audio/ogg',
            self::AUDIO_BYTES,
        );

        $job = new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$lead->id);
        $this->app->call([$job, 'handle']);

        $this->assertSame('Quero agendar uma avaliação.', $message->fresh()->body);
        $this->assertDatabaseHas('whatsapp_messages', [
            'direction' => 'outbound',
            'lead_id' => $lead->id,
            'body' => 'Claro! Qual o melhor dia?',
        ]);

        Http::assertSent(fn ($request) => $request->url() === 'https://openrouter.ai/api/v1/audio/transcriptions');
    }

    public function test_job_com_agent_pausado_nao_transcreve(): void
    {
        Http::fake();

        [$user, $connection] = $this->userConectado();
        $this->agentAtivo($user);
        $lead = $this->leadComWhatsapp($user, ['whatsapp_agent_paused_at' => now()]);
        $message = $this->inboundComMidia(
            $user,
            $connection,
            $lead,
            'ptt',
            'audio/ogg',
            self::AUDIO_BYTES,
        );

        $job = new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$lead->id);
        $this->app->call([$job, 'handle']);

        $this->assertNull($message->fresh()->body);
        $this->assertNull($message->fresh()->mediaTranscript());
        Http::assertNothingSent();
    }
}
