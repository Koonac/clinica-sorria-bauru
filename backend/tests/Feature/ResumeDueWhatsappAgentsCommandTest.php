<?php

namespace Tests\Feature;

use App\Models\Crm\Lead;
use App\Models\User;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class ResumeDueWhatsappAgentsCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CrmSeeder::class);
        $this->defaultClinic();
    }

    public function test_retoma_leads_com_resume_at_vencido(): void
    {
        $user = User::factory()->create();

        $due = Lead::create([
            'title' => 'Vencido',
            'name' => 'Ana',
            'owner_id' => $user->id,
            'whatsapp_agent_paused_at' => now()->subHours(25),
            'whatsapp_agent_resume_at' => now()->subMinute(),
        ]);

        $future = Lead::create([
            'title' => 'Futuro',
            'name' => 'Bia',
            'owner_id' => $user->id,
            'whatsapp_agent_paused_at' => now(),
            'whatsapp_agent_resume_at' => now()->addHours(12),
        ]);

        $indefinite = Lead::create([
            'title' => 'Manual',
            'name' => 'Cia',
            'owner_id' => $user->id,
            'whatsapp_agent_paused_at' => now(),
            'whatsapp_agent_resume_at' => null,
        ]);

        Artisan::call('crm:resume-whatsapp-agents');

        $this->assertNull($due->fresh()->whatsapp_agent_paused_at);
        $this->assertNull($due->fresh()->whatsapp_agent_resume_at);

        $this->assertNotNull($future->fresh()->whatsapp_agent_paused_at);
        $this->assertNotNull($future->fresh()->whatsapp_agent_resume_at);

        $this->assertNotNull($indefinite->fresh()->whatsapp_agent_paused_at);
        $this->assertNull($indefinite->fresh()->whatsapp_agent_resume_at);
    }

    public function test_transferencia_de_dono_pausa_agent_com_prazo(): void
    {
        [$user, $connection] = $this->userWithWhatsappConnection([
            'whatsapp_agent_auto_resume_hours' => 8,
        ]);
        $outro = User::factory()->create(['clinic_id' => $user->clinic_id]);

        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'owner_id' => $user->id,
            'whatsapp_agent_paused_at' => null,
            'whatsapp_agent_resume_at' => null,
        ]);

        \Laravel\Sanctum\Sanctum::actingAs($user);

        $this->patchJson("/api/v1/crm/leads/{$lead->id}", [
            'owner_id' => $outro->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.owner_id', $outro->id);

        $fresh = $lead->fresh();
        $this->assertNotNull($fresh->whatsapp_agent_paused_at);
        $this->assertNotNull($fresh->whatsapp_agent_resume_at);
        $this->assertTrue(
            $fresh->whatsapp_agent_resume_at->between(
                now()->addHours(7),
                now()->addHours(9),
            ),
        );
        $this->assertSame(8, (int) $connection->fresh()->whatsapp_agent_auto_resume_hours);
    }

    public function test_mensagem_humana_renova_resume_at_conforme_horas_da_conexao(): void
    {
        [$user, $connection] = $this->userWithWhatsappConnection([
            'whatsapp_agent_auto_resume_hours' => 6,
        ]);

        $lead = Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'whatsapp_jid' => '5511999990000@c.us',
            'owner_id' => $user->id,
            'whatsapp_agent_paused_at' => now()->subHour(),
            'whatsapp_agent_resume_at' => now()->addHour(),
        ]);

        $this->postJson(
            '/api/v1/crm/whatsapp/webhooks/messages?token='.$connection->webhook_token,
            [
                'event' => 'message',
                'session_id' => 'sess-1',
                'data' => [
                    'jid' => '5511999990000@c.us',
                    'phone_number' => '5511999990000',
                    'contact_name' => 'Ana',
                    'body' => 'Mais uma resposta humana',
                    'from_me' => true,
                    'is_group' => false,
                    'is_broadcast' => false,
                    'message_id' => 'true_5511999990000@c.us_RENEW',
                    'type' => 'chat',
                    'has_media' => false,
                    'timestamp' => now()->timestamp,
                ],
            ],
        )->assertOk();

        $fresh = $lead->fresh();
        $this->assertNotNull($fresh->whatsapp_agent_paused_at);
        $this->assertNotNull($fresh->whatsapp_agent_resume_at);
        $this->assertTrue(
            $fresh->whatsapp_agent_resume_at->between(
                now()->addHours(5),
                now()->addHours(7),
            ),
        );
    }
}
