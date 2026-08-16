<?php

namespace Tests\Feature;

use App\Models\OutboundHttpLog;
use App\Services\Crm\OpenRouterAgentClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class OutboundHttpLogTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.openrouter.key' => 'test-secret-key',
            'services.openrouter.agent_model' => 'openai/gpt-4o-mini',
            'services.whatsapp.url' => 'http://whatsapp.test',
        ]);
    }

    public function test_openrouter_success_grava_log(): void
    {
        Http::fake([
            'openrouter.ai/*' => Http::response([
                'choices' => [[
                    'message' => [
                        'role' => 'assistant',
                        'content' => 'resumo ok',
                    ],
                ]],
            ], 200),
        ]);

        $content = app(OpenRouterAgentClient::class)->complete(
            'system',
            'user message',
            'openai/gpt-4o-mini',
        );

        $this->assertSame('resumo ok', $content);

        $log = OutboundHttpLog::query()->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertSame('openrouter', $log->provider);
        $this->assertSame('POST', $log->method);
        $this->assertSame(200, $log->response_status);
        $this->assertStringContainsString('openrouter.ai', $log->url);
        $this->assertStringContainsString('user message', (string) $log->request_body);
        $this->assertStringContainsString('resumo ok', (string) $log->response_body);
        $this->assertNull($log->error);

        $headers = $log->request_headers ?? [];
        $auth = $headers['Authorization'] ?? $headers['authorization'] ?? null;
        $this->assertSame(['[redacted]'], $auth);
        $encoded = json_encode($headers);
        $this->assertStringNotContainsString('test-secret-key', (string) $encoded);
    }

    public function test_openrouter_erro_http_grava_status_e_redacta_auth(): void
    {
        Http::fake([
            'openrouter.ai/*' => Http::response([
                'error' => ['message' => 'quota exceeded'],
            ], 500),
        ]);

        try {
            app(OpenRouterAgentClient::class)->complete('s', 'u', 'openai/gpt-4o-mini');
            $this->fail('Esperava RuntimeException');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('500', $e->getMessage());
        }

        $log = OutboundHttpLog::query()->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertSame('openrouter', $log->provider);
        $this->assertSame(500, $log->response_status);
        $this->assertNotNull($log->error);

        $headers = $log->request_headers ?? [];
        $auth = $headers['Authorization'] ?? $headers['authorization'] ?? null;
        $this->assertSame(['[redacted]'], $auth);
        $this->assertStringNotContainsString('test-secret-key', (string) json_encode($headers));
    }
}
