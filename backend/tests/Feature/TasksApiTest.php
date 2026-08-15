<?php

namespace Tests\Feature;

use App\Models\Crm\Contact;
use App\Models\Crm\Deal;
use App\Models\Crm\Lead;
use App\Models\Crm\PipelineStage;
use App\Models\Crm\Task;
use App\Models\User;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TasksApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CrmSeeder::class);
    }

    private function autenticar(): User
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_cria_lista_e_conclui_tarefa_de_lead(): void
    {
        $this->autenticar();

        $lead = Lead::create(['title' => 'Lead com tarefa', 'name' => 'Ana']);

        $criada = $this->postJson('/api/v1/crm/tasks', [
            'title' => 'Ligar amanhã',
            'description' => 'Confirmar interesse',
            'due_at' => now()->addDay()->toIso8601String(),
            'lead_id' => $lead->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.title', 'Ligar amanhã')
            ->assertJsonPath('data.lead_id', $lead->id)
            ->json('data');

        $this->getJson('/api/v1/crm/tasks?lead_id='.$lead->id)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $criada['id']);

        $this->patchJson('/api/v1/crm/tasks/'.$criada['id'], ['done' => true])
            ->assertOk()
            ->assertJsonPath('data.done_at', fn ($v) => $v !== null);

        $this->assertNotNull(Task::find($criada['id'])->done_at);
    }

    public function test_exige_exatamente_um_vinculo(): void
    {
        $this->autenticar();

        $this->postJson('/api/v1/crm/tasks', [
            'title' => 'Sem vínculo',
            'due_at' => now()->toIso8601String(),
        ])->assertUnprocessable();

        $lead = Lead::create(['title' => 'L', 'name' => 'L']);
        $contact = Contact::create(['name' => 'C']);
        $stage = PipelineStage::ofKind('deal')->where('active', true)->orderBy('position')->first();
        $deal = Deal::create([
            'title' => 'D',
            'contact_id' => $contact->id,
            'stage_id' => $stage->id,
        ]);

        $this->postJson('/api/v1/crm/tasks', [
            'title' => 'Dois vínculos',
            'due_at' => now()->toIso8601String(),
            'lead_id' => $lead->id,
            'deal_id' => $deal->id,
        ])->assertUnprocessable();
    }

    public function test_pipeline_inclui_next_pending_task(): void
    {
        $this->autenticar();

        $lead = Lead::create([
            'title' => 'Lead pipeline',
            'name' => 'Bruno',
            'stage_id' => PipelineStage::ofKind('lead')->where('slug', 'new')->value('id'),
        ]);

        $proxima = Task::create([
            'title' => 'Próxima',
            'due_at' => now()->addHours(3),
            'lead_id' => $lead->id,
        ]);
        Task::create([
            'title' => 'Depois',
            'due_at' => now()->addDays(5),
            'lead_id' => $lead->id,
        ]);
        Task::create([
            'title' => 'Já feita',
            'due_at' => now()->subDay(),
            'done_at' => now(),
            'lead_id' => $lead->id,
        ]);

        $resposta = $this->getJson('/api/v1/crm/pipeline?kind=lead')->assertOk();

        $leads = collect($resposta->json('data'))
            ->flatMap(fn ($stage) => $stage['leads'] ?? []);
        $noPipeline = $leads->firstWhere('id', $lead->id);

        $this->assertNotNull($noPipeline);
        $this->assertSame($proxima->id, $noPipeline['next_pending_task']['id']);
        $this->assertSame('Próxima', $noPipeline['next_pending_task']['title']);
    }

    public function test_exclui_tarefa(): void
    {
        $this->autenticar();
        $lead = Lead::create(['title' => 'L', 'name' => 'L']);
        $task = Task::create([
            'title' => 'Apagar',
            'due_at' => now()->addDay(),
            'lead_id' => $lead->id,
        ]);

        $this->deleteJson('/api/v1/crm/tasks/'.$task->id)->assertOk();
        $this->assertDatabaseMissing('tasks', ['id' => $task->id]);
    }

    public function test_show_lead_traz_tasks(): void
    {
        $this->autenticar();
        $lead = Lead::create(['title' => 'L', 'name' => 'L']);
        Task::create([
            'title' => 'Ver no show',
            'due_at' => now()->addDay(),
            'lead_id' => $lead->id,
        ]);

        $this->getJson('/api/v1/crm/leads/'.$lead->id)
            ->assertOk()
            ->assertJsonPath('data.tasks.0.title', 'Ver no show');
    }
}
