<?php

namespace Tests\Feature;

use App\Jobs\Crm\ProcessWhatsappAiReplyJob;
use App\Models\Crm\Activity;
use App\Models\Crm\Agent;
use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WhatsappOutboundSyncTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CrmSeeder::class);
        config([
            'services.whatsapp.url' => 'http://whatsapp.test',
        ]);
    }

    private function userConectado(): User
    {
        return User::factory()->create([
            'whatsapp_status' => 'connected',
            'whatsapp_session_id' => 'sess-1',
            'whatsapp_api_username' => 'u',
            'whatsapp_api_password' => 'p',
            'whatsapp_webhook_token' => 'webhook-token-test-'.uniqid(),
        ]);
    }

    private function leadComWhatsapp(User $user): Lead
    {
        return Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'whatsapp_jid' => '5511999990000@c.us',
            'owner_id' => $user->id,
        ]);
    }

    public function test_webhook_from_me_grava_outbound_pausa_agent_e_nao_enfileira_job(): void
    {
        Queue::fake();

        $user = $this->userConectado();
        Agent::create([
            'user_id' => $user->id,
            'name' => 'Bot',
            'system_prompt' => 'Atenda.',
            'debounce_seconds' => 5,
            'is_active' => true,
        ]);
        $lead = $this->leadComWhatsapp($user);

        $response = $this->postJson(
            '/api/v1/crm/whatsapp/webhooks/messages?token='.$user->whatsapp_webhook_token,
            [
                'event' => 'message',
                'session_id' => 'sess-1',
                'data' => [
                    'jid' => '5511999990000@c.us',
                    'phone_number' => '5511999990000',
                    'contact_name' => 'Ana',
                    'body' => 'Oi, te respondo pelo celular',
                    'from_me' => true,
                    'is_group' => false,
                    'is_broadcast' => false,
                    'message_id' => 'true_5511999990000@c.us_ABC123',
                    'type' => 'chat',
                    'has_media' => false,
                    'timestamp' => now()->timestamp,
                ],
            ],
        );

        $response->assertOk()->assertJson(['success' => true]);

        $this->assertDatabaseHas('whatsapp_messages', [
            'user_id' => $user->id,
            'direction' => 'outbound',
            'body' => 'Oi, te respondo pelo celular',
            'message_id' => 'true_5511999990000@c.us_ABC123',
            'lead_id' => $lead->id,
        ]);

        $this->assertNotNull($lead->fresh()->whatsapp_agent_paused_at);
        $this->assertDatabaseHas('activities', [
            'lead_id' => $lead->id,
            'type' => 'note',
            'subject' => 'Agent pausado: resposta humana (celular)',
        ]);

        Queue::assertNotPushed(ProcessWhatsappAiReplyJob::class);
    }

    public function test_webhook_from_me_duplicado_nao_recria_mensagem_nem_activity(): void
    {
        $user = $this->userConectado();
        $lead = $this->leadComWhatsapp($user);
        $payload = [
            'event' => 'message',
            'session_id' => 'sess-1',
            'data' => [
                'jid' => '5511999990000@c.us',
                'phone_number' => '5511999990000',
                'contact_name' => 'Ana',
                'body' => 'Duplicata?',
                'from_me' => true,
                'is_group' => false,
                'is_broadcast' => false,
                'message_id' => 'true_5511999990000@c.us_DUP1',
                'type' => 'chat',
                'has_media' => false,
                'timestamp' => now()->timestamp,
            ],
        ];

        $url = '/api/v1/crm/whatsapp/webhooks/messages?token='.$user->whatsapp_webhook_token;

        $this->postJson($url, $payload)->assertOk();
        $this->postJson($url, $payload)->assertOk();

        $this->assertSame(
            1,
            WhatsappMessage::query()
                ->where('message_id', 'true_5511999990000@c.us_DUP1')
                ->count(),
        );
        $this->assertSame(
            1,
            Activity::query()
                ->where('lead_id', $lead->id)
                ->where('subject', 'Agent pausado: resposta humana (celular)')
                ->count(),
        );
    }

    public function test_send_plataforma_pausa_agent_no_lead(): void
    {
        Http::fake([
            'whatsapp.test/*' => Http::response([
                'success' => true,
                'to' => '5511999990000@c.us',
                'messageId' => 'out-platform-1',
            ], 200),
        ]);

        $user = $this->userConectado();
        Agent::create([
            'user_id' => $user->id,
            'name' => 'Bot',
            'system_prompt' => 'Atenda.',
            'debounce_seconds' => 5,
            'is_active' => true,
        ]);
        $lead = $this->leadComWhatsapp($user);

        Sanctum::actingAs($user);

        $this->postJson('/api/v1/crm/whatsapp/send', [
            'to' => '5511999990000@c.us',
            'message' => 'Resposta humana pela plataforma',
            'contact_name' => 'Ana',
        ])->assertCreated();

        $this->assertDatabaseHas('whatsapp_messages', [
            'user_id' => $user->id,
            'direction' => 'outbound',
            'body' => 'Resposta humana pela plataforma',
            'lead_id' => $lead->id,
        ]);
        $this->assertNotNull($lead->fresh()->whatsapp_agent_paused_at);
        $this->assertDatabaseHas('activities', [
            'lead_id' => $lead->id,
            'subject' => 'Agent pausado: resposta humana (plataforma)',
        ]);
    }

    public function test_send_com_imagem_persiste_has_media(): void
    {
        Http::fake([
            'whatsapp.test/*' => Http::response([
                'success' => true,
                'to' => '5511999990000@c.us',
                'messageId' => 'out-img-1',
                'hasMedia' => true,
                'media' => ['mimetype' => 'image/png', 'filename' => 'foto.png'],
            ], 200),
        ]);

        $user = $this->userConectado();
        $lead = $this->leadComWhatsapp($user);
        Sanctum::actingAs($user);

        // 1x1 PNG
        $png = base64_encode(
            hex2bin('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082')
        );

        $this->postJson('/api/v1/crm/whatsapp/send', [
            'to' => '5511999990000@c.us',
            'message' => 'Segue a foto',
            'media' => [
                'mimetype' => 'image/png',
                'data' => $png,
                'filename' => 'foto.png',
            ],
        ])->assertCreated();

        Http::assertSent(function ($request) {
            $data = $request->data();

            return str_contains($request->url(), '/send/')
                && ($data['media']['mimetype'] ?? null) === 'image/png'
                && filled($data['media']['data'] ?? null);
        });

        $this->assertDatabaseHas('whatsapp_messages', [
            'user_id' => $user->id,
            'direction' => 'outbound',
            'body' => 'Segue a foto',
            'type' => 'image',
            'has_media' => true,
            'lead_id' => $lead->id,
        ]);
        $this->assertNotNull($lead->fresh()->whatsapp_agent_paused_at);
    }

    public function test_send_rejeita_media_nao_imagem(): void
    {
        $user = $this->userConectado();
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/crm/whatsapp/send', [
            'to' => '5511999990000@c.us',
            'media' => [
                'mimetype' => 'application/pdf',
                'data' => base64_encode('fake'),
                'filename' => 'doc.pdf',
            ],
        ])->assertStatus(422);
    }

    public function test_webhook_from_me_soft_dedupe_mesmo_corpo_nao_pausa(): void
    {
        $user = $this->userConectado();
        $lead = $this->leadComWhatsapp($user);

        WhatsappMessage::create([
            'user_id' => $user->id,
            'session_id' => 'sess-1',
            'whatsapp_jid' => '5511999990000@c.us',
            'phone_number' => '5511999990000',
            'direction' => 'outbound',
            'body' => 'Mesmo texto do agent',
            'message_id' => 'out-from-api',
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $lead->id,
            'wa_timestamp' => now(),
        ]);

        $this->postJson(
            '/api/v1/crm/whatsapp/webhooks/messages?token='.$user->whatsapp_webhook_token,
            [
                'event' => 'message',
                'session_id' => 'sess-1',
                'data' => [
                    'jid' => '5511999990000@c.us',
                    'phone_number' => '5511999990000',
                    'body' => 'Mesmo texto do agent',
                    'from_me' => true,
                    'is_group' => false,
                    'is_broadcast' => false,
                    'message_id' => 'true_5511999990000@c.us_OTHER_ID',
                    'type' => 'chat',
                    'has_media' => false,
                    'timestamp' => now()->timestamp,
                ],
            ],
        )->assertOk();

        $this->assertSame(
            1,
            WhatsappMessage::query()->where('body', 'Mesmo texto do agent')->count(),
        );
        $this->assertNull($lead->fresh()->whatsapp_agent_paused_at);
    }
}
