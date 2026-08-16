<?php

namespace Tests\Feature;

use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappAttendanceSegment;
use App\Models\User;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AttendanceStatsApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CrmSeeder::class);
        $this->defaultClinic();
    }

    public function test_admin_recebe_metricas_de_atendimento(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $lead = Lead::create(['title' => 'L', 'name' => 'Maria']);

        WhatsappAttendanceSegment::create([
            'clinic_id' => $lead->clinic_id,
            'lead_id' => $lead->id,
            'mode' => WhatsappAttendanceSegment::MODE_AI,
            'user_id' => null,
            'started_at' => now()->subHours(2),
            'ended_at' => now()->subHour(),
            'duration_seconds' => 3600,
            'source' => 'lead_created',
        ]);

        WhatsappAttendanceSegment::create([
            'clinic_id' => $lead->clinic_id,
            'lead_id' => $lead->id,
            'mode' => WhatsappAttendanceSegment::MODE_HUMAN,
            'user_id' => $admin->id,
            'started_at' => now()->subHour(),
            'ended_at' => now()->subMinutes(30),
            'duration_seconds' => 1800,
            'source' => 'assume',
        ]);

        $this->getJson('/api/v1/crm/stats/attendance?dias=30')
            ->assertOk()
            ->assertJsonPath('data.total_ai_seconds', 3600)
            ->assertJsonPath('data.total_human_seconds', 1800)
            ->assertJsonPath('data.avg_human_seconds', 1800)
            ->assertJsonPath('data.clients_ai', 1)
            ->assertJsonPath('data.clients_human', 1)
            ->assertJsonPath('data.clients_total', 1)
            ->assertJsonPath('data.by_user.0.name', 'IA')
            ->assertJsonPath('data.by_user.0.mode', 'ai')
            ->assertJsonPath('data.by_user.0.clients', 1)
            ->assertJsonPath('data.by_user.0.total_seconds', 3600)
            ->assertJsonPath('data.by_user.1.user_id', $admin->id)
            ->assertJsonPath('data.by_user.1.mode', 'human')
            ->assertJsonPath('data.by_user.1.clients', 1)
            ->assertJsonPath('data.by_user.1.total_seconds', 1800);
    }

    public function test_humano_sem_responsavel_nao_entra_nas_metricas(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $lead = Lead::create(['title' => 'L', 'name' => 'João']);

        WhatsappAttendanceSegment::create([
            'clinic_id' => $lead->clinic_id,
            'lead_id' => $lead->id,
            'mode' => WhatsappAttendanceSegment::MODE_HUMAN,
            'user_id' => null,
            'started_at' => now()->subHours(16),
            'ended_at' => null,
            'duration_seconds' => null,
            'source' => 'pause',
        ]);

        $this->getJson('/api/v1/crm/stats/attendance?dias=30')
            ->assertOk()
            ->assertJsonPath('data.total_human_seconds', 0)
            ->assertJsonPath('data.clients_human', 0)
            ->assertJsonPath('data.open_human', 0)
            ->assertJsonPath('data.by_user', []);
    }

    public function test_funcionario_nao_acessa_metricas_de_atendimento(): void
    {
        Sanctum::actingAs(User::factory()->funcionario()->create([
            'clinic_id' => $this->defaultClinic()->id,
        ]));

        $this->getJson('/api/v1/crm/stats/attendance')
            ->assertForbidden();
    }
}
