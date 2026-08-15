<?php

namespace Tests\Feature;

use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappAttendanceSegment;
use App\Models\User;
use App\Services\Crm\FinalizeWhatsappConversationForLead;
use App\Services\Crm\ProcessInboundWhatsappMessage;
use App\Services\Crm\ScheduleWhatsappAttendanceAutoClose;
use App\Services\Crm\TrackWhatsappAttendanceSegment;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WhatsappConversationFinalizeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CrmSeeder::class);
        $this->defaultClinic();
    }

    public function test_ia_finaliza_sem_user_id(): void
    {
        $lead = Lead::create([
            'title' => 'Lead',
            'name' => 'Maria',
            'owner_id' => null,
        ]);

        app(TrackWhatsappAttendanceSegment::class)->handle(
            $lead,
            WhatsappAttendanceSegment::MODE_AI,
            null,
            'lead_created',
        );

        $updated = app(FinalizeWhatsappConversationForLead::class)->handle(
            $lead,
            null,
            FinalizeWhatsappConversationForLead::SOURCE_AI,
        );

        $this->assertNotNull($updated->whatsapp_conversation_closed_at);
        $this->assertNull($updated->whatsapp_conversation_closed_by);
        $this->assertSame(0, WhatsappAttendanceSegment::query()
            ->where('lead_id', $lead->id)
            ->whereNull('ended_at')
            ->count());

        $this->assertDatabaseHas('activities', [
            'lead_id' => $lead->id,
            'subject' => 'Conversa finalizada',
            'user_id' => null,
        ]);
    }

    public function test_inbound_reabre_conversa_fechada(): void
    {
        [$user, $connection] = $this->userWithWhatsappConnection([
            'whatsapp_attendance_auto_close_minutes' => 10,
        ]);

        $lead = Lead::create([
            'title' => 'Lead',
            'name' => 'Maria',
            'mobile' => '5511999991111',
            'whatsapp_jid' => '5511999991111@c.us',
            'owner_id' => null,
            'whatsapp_conversation_closed_at' => now()->subHour(),
            'whatsapp_conversation_closed_by' => $user->id,
        ]);

        $message = app(ProcessInboundWhatsappMessage::class)->handle(
            $connection,
            (string) $connection->session_id,
            [
                'jid' => '5511999991111@c.us',
                'phone_number' => '5511999991111',
                'contact_name' => 'Maria',
                'body' => 'Oi de novo',
                'from_me' => false,
                'message_id' => 'msg-reopen-1',
                'timestamp' => time(),
            ],
        );

        $this->assertNotNull($message);
        $fresh = $lead->fresh();
        $this->assertNull($fresh->whatsapp_conversation_closed_at);
        $this->assertNull($fresh->whatsapp_conversation_closed_by);
        $this->assertDatabaseHas('whatsapp_attendance_segments', [
            'lead_id' => $lead->id,
            'mode' => 'ai',
            'source' => 'reopen',
        ]);
    }

    public function test_outbound_agenda_auto_close_e_inbound_limpa(): void
    {
        [$user, $connection] = $this->userWithWhatsappConnection([
            'whatsapp_attendance_auto_close_minutes' => 15,
        ]);

        $lead = Lead::create([
            'title' => 'Lead',
            'name' => 'Maria',
            'mobile' => '5511999992222',
            'whatsapp_jid' => '5511999992222@c.us',
        ]);

        app(ScheduleWhatsappAttendanceAutoClose::class)->handle($lead, $connection);
        $scheduled = $lead->fresh();
        $this->assertNotNull($scheduled->whatsapp_auto_close_at);
        $this->assertTrue(
            $scheduled->whatsapp_auto_close_at->between(
                now()->addMinutes(14),
                now()->addMinutes(16),
            ),
        );

        app(ProcessInboundWhatsappMessage::class)->handle(
            $connection,
            (string) $connection->session_id,
            [
                'jid' => '5511999992222@c.us',
                'phone_number' => '5511999992222',
                'body' => 'Respondendo',
                'from_me' => false,
                'message_id' => 'msg-clear-1',
                'timestamp' => time(),
            ],
        );

        $this->assertNull($lead->fresh()->whatsapp_auto_close_at);
    }

    public function test_comando_fecha_conversas_com_auto_close_vencido(): void
    {
        $lead = Lead::create([
            'title' => 'Lead',
            'name' => 'Maria',
            'owner_id' => User::factory()->create()->id,
            'whatsapp_auto_close_at' => now()->subMinute(),
        ]);

        app(TrackWhatsappAttendanceSegment::class)->handle(
            $lead,
            WhatsappAttendanceSegment::MODE_AI,
            null,
            'lead_created',
        );

        Artisan::call('crm:auto-close-whatsapp-conversations');

        $fresh = $lead->fresh();
        $this->assertNotNull($fresh->whatsapp_conversation_closed_at);
        $this->assertNull($fresh->whatsapp_auto_close_at);
        $this->assertNull($fresh->owner_id);
        $this->assertSame(0, WhatsappAttendanceSegment::query()
            ->where('lead_id', $lead->id)
            ->whereNull('ended_at')
            ->count());

        $this->assertDatabaseHas('activities', [
            'lead_id' => $lead->id,
            'subject' => 'Conversa finalizada automaticamente',
        ]);
    }

    public function test_settings_persistem_auto_close_minutes(): void
    {
        [$user, $connection] = $this->userWithWhatsappConnection();
        Sanctum::actingAs($user);

        $this->putJson('/api/v1/crm/connection/settings', [
            'whatsapp_attendance_auto_close_minutes' => 25,
        ])
            ->assertOk()
            ->assertJsonPath('data.whatsapp_attendance_auto_close_minutes', 25);

        $this->assertSame(25, (int) $connection->fresh()->whatsapp_attendance_auto_close_minutes);
    }

    public function test_filtro_unassigned_usa_closed_at(): void
    {
        $controller = app(\App\Http\Controllers\Api\Crm\WhatsappController::class);
        $method = new \ReflectionMethod($controller, 'chatMatchesFilter');
        $method->setAccessible(true);

        $open = [
            'lead_id' => 1,
            'owner_id' => null,
            'whatsapp_conversation_closed_at' => null,
            'whatsapp_agent_paused_at' => null,
            'unread_count' => 0,
        ];
        $closed = [
            'lead_id' => 2,
            'owner_id' => null,
            'whatsapp_conversation_closed_at' => now()->toIso8601String(),
            'whatsapp_agent_paused_at' => null,
            'unread_count' => 0,
        ];
        $pausedOpen = [
            'lead_id' => 3,
            'owner_id' => 9,
            'whatsapp_conversation_closed_at' => null,
            'whatsapp_agent_paused_at' => now()->toIso8601String(),
            'unread_count' => 0,
        ];

        $this->assertFalse($method->invoke($controller, $open, 'unassigned', 1));
        $this->assertTrue($method->invoke($controller, $closed, 'unassigned', 1));
        $this->assertTrue($method->invoke($controller, $open, 'agent', 1));
        $this->assertFalse($method->invoke($controller, $closed, 'agent', 1));
        $this->assertTrue($method->invoke($controller, $pausedOpen, 'human', 1));
        $this->assertFalse($method->invoke($controller, $closed, 'human', 1));
    }
}
