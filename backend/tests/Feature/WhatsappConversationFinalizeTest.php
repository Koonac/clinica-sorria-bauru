<?php

namespace Tests\Feature;

use App\Jobs\Crm\SummarizeWhatsappAttendanceSegmentJob;
use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappAttendanceSegment;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use App\Services\Crm\FinalizeWhatsappConversationForLead;
use App\Services\Crm\ProcessInboundWhatsappMessage;
use App\Services\Crm\ScheduleWhatsappAttendanceAutoClose;
use App\Services\Crm\SummarizeWhatsappAttendanceSegment;
use App\Services\Crm\TrackWhatsappAttendanceSegment;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
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
        Queue::fake();

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

        Queue::assertPushed(SummarizeWhatsappAttendanceSegmentJob::class);
    }

    public function test_finalizar_envia_aviso_italico_no_whatsapp(): void
    {
        \Illuminate\Support\Facades\Http::fake([
            '*/api/whatsapp/send/*' => \Illuminate\Support\Facades\Http::response([
                'success' => true,
                'messageId' => 'wa-finalize-1',
                'to' => '5511999993333@c.us',
            ], 200),
        ]);

        [$user, $connection] = $this->userWithWhatsappConnection();
        $connection->forceFill([
            'whatsapp_finalize_notice' => '_finalizando chamado_',
        ])->save();

        $lead = Lead::create([
            'title' => 'Lead',
            'name' => 'Maria',
            'mobile' => '5511999993333',
            'whatsapp_jid' => '5511999993333@c.us',
            'owner_id' => $user->id,
        ]);

        app(FinalizeWhatsappConversationForLead::class)->handle(
            $lead,
            $user,
            FinalizeWhatsappConversationForLead::SOURCE_MANUAL,
        );

        // QUEUE_CONNECTION=sync nos testes: jobs de aviso/resumo rodam na hora.
        $this->assertDatabaseHas('whatsapp_messages', [
            'lead_id' => $lead->id,
            'direction' => 'outbound',
            'body' => '_finalizando chamado_',
            'connection_id' => $connection->id,
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
        Queue::fake();

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

        Queue::assertPushed(SummarizeWhatsappAttendanceSegmentJob::class);
    }

    public function test_resumo_sem_mensagens_grava_fallback(): void
    {
        $lead = Lead::create([
            'title' => 'Lead',
            'name' => 'Maria',
            'owner_id' => null,
        ]);

        $segment = app(TrackWhatsappAttendanceSegment::class)->handle(
            $lead,
            WhatsappAttendanceSegment::MODE_AI,
            null,
            'lead_created',
        );
        $this->assertNotNull($segment);

        $segment->forceFill([
            'ended_at' => now(),
            'duration_seconds' => 10,
        ])->save();

        app(SummarizeWhatsappAttendanceSegment::class)->handle($segment->fresh());

        $fresh = $segment->fresh();
        $this->assertSame(SummarizeWhatsappAttendanceSegment::EMPTY_SUMMARY, $fresh->ai_summary);
        $this->assertNotNull($fresh->ai_summary_at);
    }

    public function test_resumo_com_mensagens_chama_openrouter(): void
    {
        Http::fake([
            'openrouter.ai/*' => Http::response([
                'choices' => [[
                    'message' => [
                        'role' => 'assistant',
                        'content' => "- Cliente pediu avaliação\n- Sem pendências",
                    ],
                ]],
            ], 200),
        ]);

        config(['services.openrouter.key' => 'test-key']);

        [$user, $connection] = $this->userWithWhatsappConnection();
        $lead = Lead::create([
            'title' => 'Lead',
            'name' => 'Maria',
            'mobile' => '5511999994444',
            'whatsapp_jid' => '5511999994444@c.us',
            'owner_id' => $user->id,
        ]);

        $started = now()->subMinutes(30);
        $ended = now()->subMinute();

        $segment = WhatsappAttendanceSegment::create([
            'clinic_id' => $lead->clinic_id,
            'lead_id' => $lead->id,
            'mode' => WhatsappAttendanceSegment::MODE_AI,
            'user_id' => null,
            'started_at' => $started,
            'ended_at' => $ended,
            'duration_seconds' => 1740,
            'source' => 'test',
        ]);

        WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $user->id,
            'session_id' => $connection->session_id,
            'whatsapp_jid' => '5511999994444@c.us',
            'phone_number' => '5511999994444',
            'direction' => 'inbound',
            'body' => 'Quero avaliação',
            'message_id' => 'msg-sum-1',
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $lead->id,
            'wa_timestamp' => $started->copy()->addMinute(),
        ]);

        WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $user->id,
            'session_id' => $connection->session_id,
            'whatsapp_jid' => '5511999994444@c.us',
            'direction' => 'outbound',
            'body' => \App\Services\Crm\Agent\Tools\EscalarHumanoTool::TRANSFER_NOTICE,
            'message_id' => 'msg-sum-notice',
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $lead->id,
            'wa_timestamp' => $started->copy()->addMinutes(2),
        ]);

        app(SummarizeWhatsappAttendanceSegment::class)->handle($segment);

        $fresh = $segment->fresh();
        $this->assertSame("- Cliente pediu avaliação\n- Sem pendências", $fresh->ai_summary);
        $this->assertNotNull($fresh->ai_summary_at);

        Http::assertSent(function ($request) {
            if (! str_contains($request->url(), 'openrouter.ai')) {
                return false;
            }
            $payload = $request->data();
            $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE);

            return is_string($encoded)
                && str_contains($encoded, 'Quero avaliação')
                && ! str_contains($encoded, 'transferindo chamado');
        });
    }

    public function test_settings_persistem_auto_close_minutes(): void
    {
        [$user, $connection] = $this->userWithWhatsappConnection();
        Sanctum::actingAs($user);

        $this->putJson('/api/v1/crm/connection/settings', [
            'whatsapp_attendance_auto_close_minutes' => 25,
            'whatsapp_finalize_notice' => '_atendimento encerrado_',
            'whatsapp_agent_history_limit' => 55,
        ])
            ->assertOk()
            ->assertJsonPath('data.whatsapp_attendance_auto_close_minutes', 25)
            ->assertJsonPath('data.whatsapp_finalize_notice', '_atendimento encerrado_')
            ->assertJsonPath('data.whatsapp_agent_history_limit', 55);

        $this->assertSame(25, (int) $connection->fresh()->whatsapp_attendance_auto_close_minutes);
        $this->assertSame('_atendimento encerrado_', $connection->fresh()->whatsapp_finalize_notice);
        $this->assertSame(55, (int) $connection->fresh()->whatsapp_agent_history_limit);
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
