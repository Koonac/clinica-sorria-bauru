<?php

namespace Tests\Feature;

use App\Models\Crm\Appointment;
use App\Models\Crm\Lead;
use App\Models\Crm\Task;
use App\Services\Crm\Appointments\ScheduleAppointment;
use App\Services\Crm\ListAvailableCalendarSlots;
use Carbon\Carbon;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

class PanelCalendarAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    private Carbon $day;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CrmSeeder::class);
        config([
            'services.google_calendar.client_id' => 'cid',
            'services.google_calendar.client_secret' => 'csecret',
        ]);
        // Segunda-feira futura (dia útil, nunca no passado).
        $this->day = now()->next(Carbon::MONDAY)->setTime(0, 0);
        // Expediente vem do cadastro da clínica: 9h–12h, slots de 1h.
        $this->defaultClinic()->forceFill([
            'google_calendar_business_start' => 9,
            'google_calendar_business_end' => 12,
            'google_calendar_slot_minutes' => 60,
            'google_calendar_refresh_token' => null,
        ])->save();
    }

    private function lead(string $name = 'Ana'): Lead
    {
        return Lead::create(['title' => 'L', 'name' => $name, 'mobile' => '5511999990000']);
    }

    private function slots(): array
    {
        return app(ListAvailableCalendarSlots::class)->handle(['data' => $this->day->toDateString(), 'dias' => 1]);
    }

    public function test_sem_google_usa_agenda_do_painel(): void
    {
        Http::fake();
        $outro = $this->lead('Bia');
        Appointment::create([
            'lead_id' => $outro->id,
            'status' => Appointment::STATUS_SCHEDULED,
            'starts_at' => $this->day->copy()->setTime(9, 0),
            'ends_at' => $this->day->copy()->setTime(10, 0),
        ]);
        Task::create(['title' => 'Retorno', 'due_at' => $this->day->copy()->setTime(11, 0), 'lead_id' => $outro->id]);

        $result = $this->slots();

        $this->assertSame('agenda do painel', $result['fonte']);
        $inicios = array_map(fn ($s) => Carbon::parse($s['inicio'])->format('H:i'), $result['horarios']);
        $this->assertSame(['10:00'], $inicios);
        Http::assertNothingSent();
    }

    public function test_com_google_soma_freebusy_e_painel(): void
    {
        $this->defaultClinic()->forceFill(['google_calendar_refresh_token' => 'rtoken'])->save();
        Http::fake([
            'googleapis.com/oauth2/*' => Http::response(['access_token' => 'atok', 'expires_in' => 3600]),
            'googleapis.com/calendar/*' => Http::response(['calendars' => ['primary' => ['busy' => [[
                'start' => $this->day->copy()->setTime(10, 0)->toIso8601String(),
                'end' => $this->day->copy()->setTime(11, 0)->toIso8601String(),
            ]]]]]),
        ]);
        Appointment::create([
            'lead_id' => $this->lead('Bia')->id,
            'status' => Appointment::STATUS_CONFIRMED,
            'starts_at' => $this->day->copy()->setTime(9, 0),
            'ends_at' => $this->day->copy()->setTime(10, 0),
        ]);

        $result = $this->slots();

        $this->assertSame('Google Agenda + agenda do painel', $result['fonte']);
        $inicios = array_map(fn ($s) => Carbon::parse($s['inicio'])->format('H:i'), $result['horarios']);
        $this->assertSame(['11:00'], $inicios);
    }

    public function test_rotulos_dizem_hoje_e_amanha_e_sem_data_comeca_hoje(): void
    {
        Http::fake();
        // Quarta-feira 28/10/2026, 8h: todos os slots de hoje (9h–12h) ainda estão no futuro.
        $this->travelTo(Carbon::parse('2026-10-28 08:00:00', config('app.timezone')));

        $result = app(ListAvailableCalendarSlots::class)->handle(['dias' => 2]);

        $this->assertSame('quarta-feira, 28/10/2026', $result['hoje']);
        $this->assertSame('hoje (quarta-feira 28/10) às 09:00', $result['horarios'][0]['rotulo']);
        $this->assertSame('amanhã (quinta-feira 29/10) às 09:00', $result['horarios'][3]['rotulo']);
    }

    public function test_google_fora_do_ar_nao_trava_e_usa_painel(): void
    {
        $this->defaultClinic()->forceFill(['google_calendar_refresh_token' => 'rtoken'])->save();
        Http::fake(['googleapis.com/*' => Http::response(['error' => 'down'], 500)]);

        $result = $this->slots();

        $this->assertSame('agenda do painel', $result['fonte']);
        $this->assertCount(3, $result['horarios']);
    }

    public function test_agendar_sem_google_grava_so_no_painel_sem_erro(): void
    {
        Http::fake();
        $lead = $this->lead();

        $result = app(ScheduleAppointment::class)->handle($lead, [
            'title' => 'Clareamento',
            'starts_at' => $this->day->copy()->setTime(10, 0)->toIso8601String(),
            'ends_at' => $this->day->copy()->setTime(11, 0)->toIso8601String(),
        ], null, Appointment::SOURCE_AI);

        $this->assertNull($result['calendar_error']);
        $this->assertSame(Appointment::STATUS_SCHEDULED, $result['appointment']->status);
        $this->assertNull($result['appointment']->google_event_id);
        $this->assertNotNull(Task::query()->find($result['appointment']->task_id));
        Http::assertNotSent(fn (HttpRequest $r) => str_contains($r->url(), 'googleapis.com'));
    }

    public function test_ia_nao_agenda_em_horario_ocupado_mas_pode_remarcar_o_proprio(): void
    {
        Http::fake();
        $outro = $this->lead('Bia');
        Appointment::create([
            'lead_id' => $outro->id,
            'status' => Appointment::STATUS_SCHEDULED,
            'starts_at' => $this->day->copy()->setTime(9, 0),
            'ends_at' => $this->day->copy()->setTime(10, 0),
        ]);
        $lead = $this->lead();
        $schedule = app(ScheduleAppointment::class);

        try {
            $schedule->handle($lead, [
                'title' => 'Avaliação',
                'starts_at' => $this->day->copy()->setTime(9, 30)->toIso8601String(),
                'ends_at' => $this->day->copy()->setTime(10, 30)->toIso8601String(),
            ], null, Appointment::SOURCE_AI);
            $this->fail('Deveria recusar horário ocupado.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('não está mais disponível', $e->getMessage());
        }

        $first = $schedule->handle($lead, [
            'title' => 'Avaliação',
            'starts_at' => $this->day->copy()->setTime(10, 0)->toIso8601String(),
            'ends_at' => $this->day->copy()->setTime(11, 0)->toIso8601String(),
        ], null, Appointment::SOURCE_AI);

        // Remarcar para um horário que se sobrepõe ao próprio agendamento do lead é permitido.
        $second = $schedule->handle($lead, [
            'title' => 'Avaliação',
            'starts_at' => $this->day->copy()->setTime(10, 30)->toIso8601String(),
            'ends_at' => $this->day->copy()->setTime(11, 30)->toIso8601String(),
        ], null, Appointment::SOURCE_AI, null, true);

        $this->assertSame(Appointment::STATUS_CANCELLED, $first['appointment']->fresh()->status);
        $this->assertSame(Appointment::STATUS_SCHEDULED, $second['appointment']->status);
    }
}
