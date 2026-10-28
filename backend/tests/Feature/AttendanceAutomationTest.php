<?php

namespace Tests\Feature;

use App\Jobs\Crm\ProcessWhatsappAiReplyJob;
use App\Jobs\Crm\SendAppointmentReminderJob;
use App\Jobs\Crm\SendWhatsappFollowUpJob;
use App\Models\Crm\Agent;
use App\Models\Crm\Appointment;
use App\Models\Crm\ClinicKnowledgeEntry;
use App\Models\Crm\Connection;
use App\Models\Crm\CrmNotification;
use App\Models\Crm\Lead;
use App\Models\Crm\Task;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use App\Services\Crm\Agent\DetectHandoffSignals;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AttendanceAutomationTest extends TestCase
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
            'services.google_calendar.client_id' => 'cid',
            'services.google_calendar.client_secret' => 'csecret',
        ]);

        $this->defaultClinic()->forceFill([
            'google_calendar_refresh_token' => 'rtoken',
            'google_calendar_id' => 'primary',
        ])->save();
    }

    private function agentAtivo(User $user): Agent
    {
        return Agent::create([
            'user_id' => $user->id,
            'name' => 'Bot',
            'system_prompt' => 'Atenda com educação.',
            'debounce_seconds' => 10,
            'is_active' => true,
        ]);
    }

    private function lead(User $user, array $extra = []): Lead
    {
        return Lead::create(array_merge([
            'title' => 'L',
            'name' => 'Ana Souza',
            'mobile' => '5511999990000',
            'whatsapp_jid' => '5511999990000@c.us',
            'owner_id' => $user->id,
        ], $extra));
    }

    private function message(User $user, Connection $connection, Lead $lead, string $direction, string $body): WhatsappMessage
    {
        return WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $user->id,
            'session_id' => 'sess-1',
            'whatsapp_jid' => '5511999990000@c.us',
            'phone_number' => '5511999990000',
            'contact_name' => $lead->name,
            'direction' => $direction,
            'body' => $body,
            'message_id' => 'msg-'.uniqid(),
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => $lead->id,
            'wa_timestamp' => now(),
        ]);
    }

    /**
     * @param  list<array{name: string, arguments: array<string, mixed>}>  $calls
     */
    private function toolCallsResponse(array $calls): array
    {
        return [
            'choices' => [[
                'message' => [
                    'role' => 'assistant',
                    'content' => null,
                    'tool_calls' => array_map(fn ($call, $i) => [
                        'id' => 'call_'.$i,
                        'type' => 'function',
                        'function' => [
                            'name' => $call['name'],
                            'arguments' => json_encode($call['arguments'], JSON_UNESCAPED_UNICODE),
                        ],
                    ], $calls, array_keys($calls)),
                ],
            ]],
        ];
    }

    private function runAiJob(Connection $connection, Lead $lead): void
    {
        $this->app->call([new ProcessWhatsappAiReplyJob($connection->id, 'lead:'.$lead->id), 'handle']);
    }

    private function openRouterRequests(): array
    {
        return Http::recorded(fn (HttpRequest $r) => str_contains($r->url(), 'openrouter.ai'))
            ->map(fn ($pair) => $pair[0]->data())
            ->values()
            ->all();
    }

    // --- Base de conhecimento ---

    public function test_admin_gerencia_base_de_conhecimento_e_funcionario_so_le(): void
    {
        [$admin] = $this->userWithWhatsappConnection();
        Sanctum::actingAs($admin);

        $created = $this->postJson('/api/v1/crm/knowledge', [
            'category' => 'endereco',
            'title' => 'Endereço',
            'content' => 'Rua das Flores, 100 - Centro, Bauru',
        ])->assertCreated()->json('data');

        $this->patchJson('/api/v1/crm/knowledge/'.$created['id'], ['content' => 'Rua das Flores, 200'])
            ->assertOk()
            ->assertJsonPath('data.content', 'Rua das Flores, 200');

        $funcionario = User::factory()->create(['clinic_id' => $admin->clinic_id, 'role' => User::ROLE_FUNCIONARIO]);
        Sanctum::actingAs($funcionario);

        $this->getJson('/api/v1/crm/knowledge')->assertOk()->assertJsonCount(1, 'data');
        $this->postJson('/api/v1/crm/knowledge', ['category' => 'outros', 'content' => 'x'])->assertForbidden();
    }

    public function test_system_prompt_inclui_informacoes_da_clinica(): void
    {
        Http::fake([
            'openrouter.ai/*' => Http::response($this->toolCallsResponse([
                ['name' => 'enviar_resposta', 'arguments' => ['texto' => 'Ficamos na Rua das Flores, 100.']],
            ])),
            'whatsapp.test/*' => Http::response(['success' => true, 'to' => '5511999990000@c.us', 'messageId' => 'out-1']),
        ]);

        [$user, $connection] = $this->userWithWhatsappConnection();
        $this->agentAtivo($user);
        ClinicKnowledgeEntry::create(['category' => 'endereco', 'content' => 'Rua das Flores, 100 - Centro']);
        ClinicKnowledgeEntry::create(['category' => 'convenios', 'content' => 'Odontoprev e Amil Dental']);
        ClinicKnowledgeEntry::create(['category' => 'pagamento', 'content' => 'Pix escondido', 'active' => false]);
        $lead = $this->lead($user);
        $this->message($user, $connection, $lead, 'inbound', 'Onde fica a clínica?');

        $this->runAiJob($connection, $lead);

        $system = $this->openRouterRequests()[0]['messages'][0]['content'];
        $this->assertStringContainsString('da clínica "'.$this->defaultClinic()->name.'"', $system);
        $this->assertStringContainsString('Informações da clínica', $system);
        $this->assertStringContainsString('Rua das Flores, 100 - Centro', $system);
        $this->assertStringContainsString('Odontoprev e Amil Dental', $system);
        $this->assertStringNotContainsString('Pix escondido', $system);
    }

    // --- Status de atendimento ---

    public function test_inbound_e_resposta_da_ia_atualizam_status_de_atendimento(): void
    {
        Http::fake([
            'openrouter.ai/*' => Http::response($this->toolCallsResponse([
                ['name' => 'enviar_resposta', 'arguments' => ['texto' => 'Olá!']],
            ])),
            'whatsapp.test/*' => Http::response(['success' => true, 'to' => '5511999990000@c.us', 'messageId' => 'out-1']),
        ]);

        [$user, $connection] = $this->userWithWhatsappConnection();
        $this->agentAtivo($user);
        $lead = $this->lead($user);
        $this->assertSame(Lead::ATTENDANCE_NEW, $lead->fresh()->attendance_status);

        $this->message($user, $connection, $lead, 'inbound', 'Oi');
        $this->runAiJob($connection, $lead);

        $this->assertSame(Lead::ATTENDANCE_IN_PROGRESS, $lead->fresh()->attendance_status);

        $lead->forceFill(['attendance_status' => Lead::ATTENDANCE_NO_REPLY])->save();
        $this->postJson('/api/v1/crm/whatsapp/webhooks/messages?token='.$connection->webhook_token, [
            'event' => 'message',
            'session_id' => 'sess-1',
            'data' => [
                'jid' => '5511999990000@c.us',
                'phone_number' => '5511999990000',
                'contact_name' => 'Ana',
                'body' => 'Voltei!',
                'from_me' => false,
                'message_id' => 'false_5511999990000@c.us_IN1',
                'type' => 'chat',
                'has_media' => false,
                'timestamp' => now()->timestamp,
            ],
        ])->assertOk();

        $this->assertSame(Lead::ATTENDANCE_IN_PROGRESS, $lead->fresh()->attendance_status);
    }

    public function test_lead_aceita_ajuste_manual_e_filtro_por_status(): void
    {
        [$user] = $this->userWithWhatsappConnection();
        Sanctum::actingAs($user);
        $lead = $this->lead($user);
        $this->lead($user, ['name' => 'Outro', 'mobile' => '5511888880000', 'whatsapp_jid' => null]);

        $this->patchJson('/api/v1/crm/leads/'.$lead->id, ['attendance_status' => 'agendado'])
            ->assertOk()
            ->assertJsonPath('data.attendance_status', 'agendado');
        $this->patchJson('/api/v1/crm/leads/'.$lead->id, ['attendance_status' => 'invalido'])->assertUnprocessable();

        $this->getJson('/api/v1/crm/leads?attendance_status=agendado')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    // --- Handoff ---

    public function test_escalar_humano_urgente_notifica_painel_e_whatsapp_da_recepcao(): void
    {
        Http::fake([
            'openrouter.ai/*' => Http::response($this->toolCallsResponse([
                ['name' => 'escalar_humano', 'arguments' => ['motivo' => 'Dor forte e sangramento', 'categoria' => 'urgencia_dor']],
            ])),
            'whatsapp.test/*' => Http::response(['success' => true, 'to' => '5511999990000@c.us', 'messageId' => 'out-'.uniqid()]),
        ]);

        [$user, $connection] = $this->userWithWhatsappConnection(['reception_alert_jid' => '5514333330000@c.us']);
        $this->agentAtivo($user);
        $lead = $this->lead($user);
        $this->message($user, $connection, $lead, 'inbound', 'Estou com muita dor e sangrando');

        $this->runAiJob($connection, $lead);

        $notification = CrmNotification::query()->firstOrFail();
        $this->assertSame(CrmNotification::TYPE_URGENCY, $notification->type);
        $this->assertSame(CrmNotification::PRIORITY_URGENT, $notification->priority);
        $this->assertSame($lead->id, $notification->lead_id);
        $this->assertSame(Lead::ATTENDANCE_HUMAN, $lead->fresh()->attendance_status);

        Http::assertSent(fn (HttpRequest $r) => str_contains($r->url(), 'whatsapp.test')
            && ($r->data()['to'] ?? null) === '5514333330000@c.us'
            && str_contains((string) ($r->data()['message'] ?? ''), 'Urgência'));

        $system = $this->openRouterRequests()[0]['messages'][0]['content'];
        $this->assertStringContainsString('sinais de dor/urgência', $system);
    }

    public function test_eco_da_mensagem_para_recepcao_nao_vira_lead(): void
    {
        [$user, $connection] = $this->userWithWhatsappConnection(['reception_alert_jid' => '5514333330000@c.us']);

        $this->postJson('/api/v1/crm/whatsapp/webhooks/messages?token='.$connection->webhook_token, [
            'event' => 'message',
            'session_id' => 'sess-1',
            'data' => [
                'jid' => '5514333330000@c.us',
                'phone_number' => '5514333330000',
                'body' => '🔔 Novo pré-agendamento',
                'from_me' => true,
                'message_id' => 'true_5514333330000@c.us_X',
                'type' => 'chat',
                'has_media' => false,
                'timestamp' => now()->timestamp,
            ],
        ])->assertOk();

        $this->assertDatabaseCount('whatsapp_messages', 0);
        $this->assertSame(0, Lead::query()->where('mobile', 'like', '%5514333330000%')->count());
    }

    public function test_detector_de_sinais_de_handoff(): void
    {
        $detector = new DetectHandoffSignals;

        $this->assertSame(['dor/urgência'], $detector->handle('Meu dente tá doendo muito'));
        $this->assertSame(['reclamação'], $detector->handle('Isso é um absurdo, quero reclamar'));
        $this->assertSame(['pedido de humano'], $detector->handle('Quero falar com uma pessoa de verdade'));
        $this->assertSame([], $detector->handle('Quero agendar uma limpeza'));
    }

    // --- Notificações ---

    public function test_notificacoes_por_usuario_lidas_e_contador(): void
    {
        [$user] = $this->userWithWhatsappConnection();
        $other = User::factory()->create(['clinic_id' => $user->clinic_id, 'role' => User::ROLE_FUNCIONARIO]);
        CrmNotification::create(['type' => 'handoff', 'title' => 'A']);
        $second = CrmNotification::create(['type' => 'urgencia', 'priority' => 'urgent', 'title' => 'B']);

        Sanctum::actingAs($user);
        $this->getJson('/api/v1/crm/notifications')->assertOk()->assertJsonPath('meta.unread_count', 2);
        $this->postJson('/api/v1/crm/notifications/'.$second->id.'/read')->assertOk();
        $this->getJson('/api/v1/crm/notifications?unread=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.unread_count', 1);
        $this->postJson('/api/v1/crm/notifications/read-all')->assertOk()->assertJsonPath('data.marked', 1);

        Sanctum::actingAs($other);
        $this->getJson('/api/v1/crm/notifications')->assertOk()->assertJsonPath('meta.unread_count', 2);
    }

    // --- Pré-agendamento ---

    public function test_modo_pre_agendamento_troca_tools_e_avisa_recepcao(): void
    {
        Http::fake([
            'openrouter.ai/*' => Http::sequence()
                ->push($this->toolCallsResponse([
                    ['name' => 'registrar_pre_agendamento', 'arguments' => ['preferencia' => 'terça de manhã', 'observacoes' => 'primeira consulta']],
                ]))
                ->push(['choices' => [['message' => ['role' => 'assistant', 'content' => null, 'tool_calls' => []]]]]),
            'whatsapp.test/*' => Http::response(['success' => true]),
        ]);

        [$user, $connection] = $this->userWithWhatsappConnection(['scheduling_mode' => Connection::SCHEDULING_PRE_BOOKING]);
        $this->agentAtivo($user);
        $lead = $this->lead($user);
        $this->message($user, $connection, $lead, 'inbound', 'Quero marcar para terça de manhã');

        $this->runAiJob($connection, $lead);

        $toolNames = array_map(fn ($t) => $t['function']['name'], $this->openRouterRequests()[0]['tools']);
        $this->assertContains('registrar_pre_agendamento', $toolNames);
        $this->assertNotContains('criar_agendamento', $toolNames);

        $appointment = Appointment::query()->firstOrFail();
        $this->assertSame(Appointment::STATUS_PRE_BOOKED, $appointment->status);
        $this->assertSame('terça de manhã', $appointment->preferred_text);
        $this->assertSame(Lead::ATTENDANCE_PRE_BOOKED, $lead->fresh()->attendance_status);
        $this->assertDatabaseHas('crm_notifications', [
            'type' => CrmNotification::TYPE_PRE_BOOKING,
            'appointment_id' => $appointment->id,
        ]);
        $this->assertSame(0, Task::query()->count());
    }

    public function test_recepcao_confirma_pre_agendamento_cria_evento_e_avisa_paciente(): void
    {
        $inicio = now()->addDays(2)->setTime(10, 0);
        Http::fake([
            'googleapis.com/oauth2/*' => Http::response(['access_token' => 'atok', 'expires_in' => 3600]),
            'googleapis.com/calendar/*' => Http::response(['id' => 'evt-9', 'htmlLink' => 'https://calendar.google.com/event?eid=9']),
            'whatsapp.test/*' => Http::response(['success' => true, 'to' => '5511999990000@c.us', 'messageId' => 'out-conf']),
        ]);

        [$user] = $this->userWithWhatsappConnection();
        Sanctum::actingAs($user);
        $lead = $this->lead($user, ['attendance_status' => Lead::ATTENDANCE_PRE_BOOKED]);
        $appointment = Appointment::create([
            'lead_id' => $lead->id,
            'status' => Appointment::STATUS_PRE_BOOKED,
            'preferred_text' => 'terça de manhã',
        ]);

        $this->postJson('/api/v1/crm/appointments/'.$appointment->id.'/confirm', [
            'starts_at' => $inicio->toIso8601String(),
            'ends_at' => $inicio->copy()->addMinutes(30)->toIso8601String(),
            'title' => 'Avaliação',
            'notify_patient' => true,
        ])->assertOk()
            ->assertJsonPath('data.status', Appointment::STATUS_SCHEDULED)
            ->assertJsonPath('meta.patient_notified', true);

        $appointment->refresh();
        $this->assertSame('evt-9', $appointment->google_event_id);
        $this->assertNotNull($appointment->task_id);
        $this->assertSame($user->id, $appointment->confirmed_by);
        $this->assertSame(Lead::ATTENDANCE_SCHEDULED, $lead->fresh()->attendance_status);
        $this->assertDatabaseHas('whatsapp_messages', [
            'lead_id' => $lead->id,
            'direction' => 'outbound',
            'message_id' => 'out-conf',
        ]);

        $this->postJson('/api/v1/crm/appointments/'.$appointment->id.'/confirm', [
            'starts_at' => $inicio->toIso8601String(),
            'ends_at' => $inicio->copy()->addMinutes(30)->toIso8601String(),
        ])->assertUnprocessable();
    }

    public function test_criar_agendamento_no_modo_direto_grava_appointment_sem_deal_na_task(): void
    {
        $inicio = now()->addDay()->setTime(14, 0);
        Http::fake([
            'openrouter.ai/*' => Http::response($this->toolCallsResponse([
                ['name' => 'criar_agendamento', 'arguments' => [
                    'titulo' => 'Limpeza',
                    'inicio' => $inicio->toIso8601String(),
                    'fim' => $inicio->copy()->addHour()->toIso8601String(),
                ]],
            ])),
            'googleapis.com/oauth2/*' => Http::response(['access_token' => 'atok', 'expires_in' => 3600]),
            'googleapis.com/calendar/*' => Http::response(['id' => 'evt-1', 'htmlLink' => 'https://calendar.google.com/event?eid=1']),
        ]);

        [$user, $connection] = $this->userWithWhatsappConnection();
        $this->agentAtivo($user);
        $lead = $this->lead($user);
        $this->message($user, $connection, $lead, 'inbound', 'Quero amanhã às 14h');

        $this->runAiJob($connection, $lead);

        $appointment = Appointment::query()->firstOrFail();
        $this->assertSame(Appointment::STATUS_SCHEDULED, $appointment->status);
        $this->assertSame(Appointment::SOURCE_AI, $appointment->source);
        $task = Task::query()->findOrFail($appointment->task_id);
        $this->assertSame($lead->id, $task->lead_id);
        $this->assertNull($task->deal_id);
        $this->assertSame(Lead::ATTENDANCE_SCHEDULED, $lead->fresh()->attendance_status);
    }

    // --- Lembrete ---

    public function test_lembrete_enviado_uma_vez_e_paciente_confirma_pela_ia(): void
    {
        $this->travelTo(now()->setTime(10, 0));
        Http::fake([
            'whatsapp.test/*' => Http::response(['success' => true, 'to' => '5511999990000@c.us', 'messageId' => 'out-'.uniqid()]),
        ]);

        [$user, $connection] = $this->userWithWhatsappConnection();
        $lead = $this->lead($user, ['attendance_status' => Lead::ATTENDANCE_SCHEDULED]);
        $appointment = Appointment::create([
            'lead_id' => $lead->id,
            'status' => Appointment::STATUS_SCHEDULED,
            'title' => 'Avaliação',
            'starts_at' => now()->addHours(20),
            'ends_at' => now()->addHours(21),
        ]);
        $longe = Appointment::create([
            'lead_id' => $lead->id,
            'status' => Appointment::STATUS_SCHEDULED,
            'starts_at' => now()->addDays(5),
            'ends_at' => now()->addDays(5)->addHour(),
        ]);

        $this->artisan('crm:send-appointment-reminders')->assertSuccessful();
        $this->artisan('crm:send-appointment-reminders')->assertSuccessful();

        $this->assertNotNull($appointment->fresh()->reminder_sent_at);
        $this->assertNull($longe->fresh()->reminder_sent_at);
        Http::assertSentCount(1);
        Http::assertSent(fn (HttpRequest $r) => str_contains((string) ($r->data()['message'] ?? ''), 'Ana! Passando para lembrar')
            && str_contains((string) ($r->data()['message'] ?? ''), 'amanhã'));

        Http::fake([
            'openrouter.ai/*' => Http::sequence()
                ->push($this->toolCallsResponse([
                    ['name' => 'atualizar_consulta', 'arguments' => ['consulta_id' => $appointment->id, 'acao' => 'confirmar']],
                ]))
                ->push(['choices' => [['message' => ['role' => 'assistant', 'content' => null, 'tool_calls' => []]]]]),
            'whatsapp.test/*' => Http::response(['success' => true]),
        ]);
        $this->agentAtivo($user);
        $this->message($user, $connection, $lead, 'inbound', 'Confirmo!');
        $this->runAiJob($connection, $lead);

        $this->assertSame(Appointment::STATUS_CONFIRMED, $appointment->fresh()->status);
        $this->assertStringContainsString('"id":'.$appointment->id, $this->openRouterRequests()[0]['messages'][0]['content']);
        $this->assertDatabaseHas('crm_notifications', ['type' => CrmNotification::TYPE_APPOINTMENT_CONFIRMED]);
    }

    public function test_lembrete_respeita_janela_de_envio(): void
    {
        $this->travelTo(now()->setTime(22, 30));
        Http::fake();

        [$user] = $this->userWithWhatsappConnection();
        $lead = $this->lead($user);
        $appointment = Appointment::create([
            'lead_id' => $lead->id,
            'status' => Appointment::STATUS_SCHEDULED,
            'starts_at' => now()->addHours(12),
            'ends_at' => now()->addHours(13),
        ]);

        $this->artisan('crm:send-appointment-reminders')->assertSuccessful();

        $this->assertNull($appointment->fresh()->reminder_sent_at);
        Http::assertNothingSent();
    }

    // --- Follow-up ---

    public function test_follow_up_armado_apos_resposta_e_cancelado_quando_paciente_responde(): void
    {
        Http::fake([
            'openrouter.ai/*' => Http::response($this->toolCallsResponse([
                ['name' => 'enviar_resposta', 'arguments' => ['texto' => 'Qual dia fica melhor?']],
            ])),
            'whatsapp.test/*' => Http::response(['success' => true, 'to' => '5511999990000@c.us', 'messageId' => 'out-1']),
        ]);

        [$user, $connection] = $this->userWithWhatsappConnection(['whatsapp_follow_up_enabled' => true]);
        $this->agentAtivo($user);
        $lead = $this->lead($user);
        $this->message($user, $connection, $lead, 'inbound', 'Quero marcar');

        $this->runAiJob($connection, $lead);

        $lead->refresh();
        $this->assertSame(0, $lead->whatsapp_follow_up_step);
        $this->assertNotNull($lead->whatsapp_follow_up_due_at);
        $this->assertEqualsWithDelta(now()->addMinutes(120)->timestamp, $lead->whatsapp_follow_up_due_at->timestamp, 5);

        // Sem agent ativo a fila síncrona não responde de novo (o que rearmaria a sequência).
        Agent::query()->update(['is_active' => false]);
        $this->postJson('/api/v1/crm/whatsapp/webhooks/messages?token='.$connection->webhook_token, [
            'event' => 'message',
            'session_id' => 'sess-1',
            'data' => [
                'jid' => '5511999990000@c.us',
                'phone_number' => '5511999990000',
                'body' => 'Pode ser sexta',
                'from_me' => false,
                'message_id' => 'false_5511999990000@c.us_IN2',
                'type' => 'chat',
                'has_media' => false,
                'timestamp' => now()->timestamp,
            ],
        ])->assertOk();

        $this->assertNull($lead->fresh()->whatsapp_follow_up_due_at);
    }

    public function test_sequencia_de_follow_up_envia_tres_e_marca_sem_resposta(): void
    {
        $this->travelTo(now()->setTime(10, 0));
        Http::fake([
            'openrouter.ai/*' => Http::response(['choices' => [['message' => ['role' => 'assistant', 'content' => 'Oi, Ana! Conseguiu ver os horários?']]]]),
            'whatsapp.test/*' => fn () => Http::response(['success' => true, 'to' => '5511999990000@c.us', 'messageId' => 'fu-'.uniqid()]),
        ]);

        [$user, $connection] = $this->userWithWhatsappConnection([
            'whatsapp_follow_up_enabled' => true,
            'whatsapp_follow_up_delays' => [10, 20, 30],
        ]);
        $this->agentAtivo($user);
        $lead = $this->lead($user, [
            'attendance_status' => Lead::ATTENDANCE_IN_PROGRESS,
            'whatsapp_follow_up_due_at' => now()->subMinute(),
        ]);
        $this->message($user, $connection, $lead, 'inbound', 'Quero marcar');
        $this->message($user, $connection, $lead, 'outbound', 'Qual dia fica melhor?');

        for ($i = 1; $i <= 3; $i++) {
            $this->artisan('crm:send-whatsapp-follow-ups')->assertSuccessful();
            $lead->refresh();
            $this->assertSame($i, $lead->whatsapp_follow_up_step);
            if ($i < 3) {
                $this->travelTo($lead->whatsapp_follow_up_due_at->copy()->addSecond());
            }
        }

        $this->assertNull($lead->whatsapp_follow_up_due_at);
        $this->assertSame(Lead::ATTENDANCE_NO_REPLY, $lead->attendance_status);
        $this->assertSame(3, WhatsappMessage::query()->where('raw->system_kind', 'follow_up')->count());

        $prompts = $this->openRouterRequests();
        $this->assertStringContainsString('tentativa 1 de 3', $prompts[0]['messages'][0]['content']);
        $this->assertStringContainsString('ÚLTIMA tentativa', $prompts[2]['messages'][0]['content']);
    }

    public function test_finalizacao_pela_ia_mantem_follow_up_e_manual_cancela(): void
    {
        Http::fake();
        [$user, $connection] = $this->userWithWhatsappConnection(['whatsapp_follow_up_enabled' => true]);
        $finalizer = app(\App\Services\Crm\FinalizeWhatsappConversationForLead::class);

        $porIa = $this->lead($user, ['whatsapp_follow_up_due_at' => now()->addMinutes(5)]);
        $finalizer->handle($porIa, null, \App\Services\Crm\FinalizeWhatsappConversationForLead::SOURCE_AI);
        $this->assertNotNull($porIa->fresh()->whatsapp_follow_up_due_at);

        $manual = $this->lead($user, [
            'name' => 'Bia',
            'mobile' => '5511777770000',
            'whatsapp_jid' => '5511777770000@c.us',
            'whatsapp_follow_up_due_at' => now()->addMinutes(5),
        ]);
        $finalizer->handle($manual, $user, \App\Services\Crm\FinalizeWhatsappConversationForLead::SOURCE_MANUAL);
        $this->assertNull($manual->fresh()->whatsapp_follow_up_due_at);
    }

    public function test_follow_up_pular_encerra_e_pausa_humana_bloqueia(): void
    {
        $this->travelTo(now()->setTime(10, 0));
        Http::fake([
            'openrouter.ai/*' => Http::response(['choices' => [['message' => ['role' => 'assistant', 'content' => 'PULAR: paciente disse que não tem interesse']]]]),
            'whatsapp.test/*' => Http::response(['success' => true]),
        ]);

        [$user, $connection] = $this->userWithWhatsappConnection(['whatsapp_follow_up_enabled' => true]);
        $this->agentAtivo($user);
        $lead = $this->lead($user, ['whatsapp_follow_up_due_at' => now()->subMinute()]);
        $this->message($user, $connection, $lead, 'outbound', 'Algo mais?');

        $this->app->call([new SendWhatsappFollowUpJob($lead->id), 'handle']);
        $this->assertNull($lead->fresh()->whatsapp_follow_up_due_at);
        Http::assertNotSent(fn (HttpRequest $r) => str_contains($r->url(), 'whatsapp.test'));
        $this->assertDatabaseHas('activities', [
            'lead_id' => $lead->id,
            'subject' => 'Follow-up automático encerrado pela IA',
            'body' => 'Motivo: paciente disse que não tem interesse.',
        ]);

        $pausado = $this->lead($user, [
            'name' => 'Bia',
            'mobile' => '5511777770000',
            'whatsapp_jid' => '5511777770000@c.us',
            'whatsapp_agent_paused_at' => now(),
            'whatsapp_follow_up_due_at' => now()->subMinute(),
        ]);
        $this->app->call([new SendWhatsappFollowUpJob($pausado->id), 'handle']);
        $this->assertNull($pausado->fresh()->whatsapp_follow_up_due_at);
        $this->assertDatabaseHas('activities', [
            'lead_id' => $pausado->id,
            'subject' => 'Follow-up automático cancelado',
            'body' => 'Motivo: IA pausada neste lead (atendimento humano).',
        ]);
        Http::assertNotSent(fn (HttpRequest $r) => str_contains($r->url(), 'whatsapp.test'));
    }

    public function test_follow_up_fora_da_janela_e_adiado(): void
    {
        $this->travelTo(now()->setTime(23, 0));
        Http::fake();

        [$user] = $this->userWithWhatsappConnection(['whatsapp_follow_up_enabled' => true]);
        $lead = $this->lead($user, ['whatsapp_follow_up_due_at' => now()->subMinute()]);

        $this->artisan('crm:send-whatsapp-follow-ups')->assertSuccessful();

        $due = $lead->fresh()->whatsapp_follow_up_due_at->timezone(config('app.timezone'));
        $this->assertSame(8, $due->hour);
        $this->assertTrue($due->isTomorrow());
        Http::assertNothingSent();
    }

    public function test_configuracoes_de_automacao_na_conexao(): void
    {
        [$user] = $this->userWithWhatsappConnection();
        Sanctum::actingAs($user);

        $this->putJson('/api/v1/crm/connection/settings', [
            'scheduling_mode' => 'pre_booking',
            'reception_alert_jid' => '(14) 99999-1234',
            'whatsapp_follow_up_enabled' => true,
            'whatsapp_follow_up_delays' => [60, 1440],
            'appointment_reminder_hours' => 12,
        ])->assertOk();

        $connection = Connection::query()->firstOrFail();
        $this->assertSame('pre_booking', $connection->scheduling_mode);
        $this->assertSame('5514999991234@c.us', $connection->reception_alert_jid);
        $this->assertSame([60, 1440], $connection->resolvedFollowUpDelays());
        $this->assertSame(12, $connection->resolvedReminderHours());

        $this->putJson('/api/v1/crm/connection/settings', ['scheduling_mode' => 'outro'])->assertUnprocessable();
    }

    public function test_reminder_job_ignora_consulta_cancelada(): void
    {
        Http::fake();
        [$user] = $this->userWithWhatsappConnection();
        $lead = $this->lead($user);
        $appointment = Appointment::create([
            'lead_id' => $lead->id,
            'status' => Appointment::STATUS_CANCELLED,
            'starts_at' => now()->addHours(10),
        ]);

        $this->app->call([new SendAppointmentReminderJob($appointment->id), 'handle']);

        Http::assertNothingSent();
    }
}
