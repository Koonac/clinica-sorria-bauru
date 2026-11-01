<?php

namespace Tests\Feature;

use App\Models\Crm\WhatsappMessage;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class WhatsappInboundWebhookResilienceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CrmSeeder::class);
        $this->defaultClinic();
    }

    /**
     * @return array<string, mixed>
     */
    private function inboundPayload(string $body = 'Oiii'): array
    {
        return [
            'event' => 'message',
            'session_id' => 'sess-1',
            'data' => [
                'jid' => '5514997387369@c.us',
                'phone_number' => '5514997387369',
                'contact_name' => 'Kaed AI - Henrique',
                'body' => $body,
                'from_me' => false,
                'is_group' => false,
                'is_broadcast' => false,
                'message_id' => 'false_5514997387369@c.us_'.uniqid(),
                'type' => 'chat',
                'has_media' => false,
                'timestamp' => now()->timestamp,
            ],
        ];
    }

    public function test_inbound_grava_quando_conexao_nao_tem_created_by(): void
    {
        Queue::fake();

        [, $connection] = $this->userWithWhatsappConnection(['created_by' => null]);
        $this->assertNull($connection->fresh()->created_by);

        $this->postJson(
            '/api/v1/crm/whatsapp/webhooks/messages?token='.$connection->webhook_token,
            $this->inboundPayload('sem created_by'),
        )->assertOk()->assertJson(['success' => true]);

        $this->assertDatabaseHas('whatsapp_messages', [
            'connection_id' => $connection->id,
            'clinic_id' => $connection->clinic_id,
            'direction' => 'inbound',
            'body' => 'sem created_by',
            'whatsapp_jid' => '5514997387369@c.us',
        ]);
        $this->assertNotNull(
            WhatsappMessage::query()->where('body', 'sem created_by')->value('user_id'),
        );
    }

    public function test_inbound_grava_quando_token_google_da_clinica_esta_corrompido(): void
    {
        Queue::fake();

        [, $connection] = $this->userWithWhatsappConnection();

        DB::table('clinics')->where('id', $connection->clinic_id)->update([
            'google_calendar_refresh_token' => 'token-em-texto-puro',
        ]);

        $this->postJson(
            '/api/v1/crm/whatsapp/webhooks/messages?token='.$connection->webhook_token,
            $this->inboundPayload('token google corrompido'),
        )->assertOk()->assertJson(['success' => true]);

        $this->assertDatabaseHas('whatsapp_messages', [
            'connection_id' => $connection->id,
            'direction' => 'inbound',
            'body' => 'token google corrompido',
        ]);
    }
}
