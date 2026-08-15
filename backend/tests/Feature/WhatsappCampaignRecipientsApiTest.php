<?php

namespace Tests\Feature;

use App\Models\Crm\WhatsappCampaign;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WhatsappCampaignRecipientsApiTest extends TestCase
{
    use RefreshDatabase;

    private function autenticar(): User
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        return $user;
    }

    private function campanha(User $user): WhatsappCampaign
    {
        return WhatsappCampaign::create([
            'user_id' => $user->id,
            'name' => 'Follow-up',
            'status' => 'draft',
            'delay_between_contacts_sec' => 45,
            'delay_jitter_sec' => 15,
            'total_recipients' => 0,
        ]);
    }

    public function test_adiciona_destinatario_avulso(): void
    {
        $user = $this->autenticar();
        $campaign = $this->campanha($user);

        $this->postJson("/api/v1/crm/campaigns/{$campaign->id}/recipients", [
            'full_name' => 'Maria Silva',
            'phone' => '11999998888',
            'notes' => 'Cliente VIP',
        ])
            ->assertCreated()
            ->assertJsonPath('data.recipient.full_name', 'Maria Silva')
            ->assertJsonPath('data.recipient.phone', '5511999998888')
            ->assertJsonPath('data.recipient.notes', 'Cliente VIP')
            ->assertJsonPath('data.recipient.status', 'pending')
            ->assertJsonPath('data.total_recipients', 1);

        $this->assertDatabaseHas('whatsapp_campaign_recipients', [
            'whatsapp_campaign_id' => $campaign->id,
            'phone' => '5511999998888',
        ]);
        $this->assertSame(1, $campaign->fresh()->total_recipients);
    }

    public function test_adiciona_sem_apagar_destinatarios_existentes(): void
    {
        $user = $this->autenticar();
        $campaign = $this->campanha($user);
        $campaign->recipients()->create([
            'full_name' => 'João',
            'phone' => '5511888777666',
            'notes' => '',
            'status' => 'pending',
        ]);
        $campaign->update(['total_recipients' => 1]);

        $this->postJson("/api/v1/crm/campaigns/{$campaign->id}/recipients", [
            'phone' => '11911112222',
        ])->assertCreated();

        $this->assertSame(2, $campaign->recipients()->count());
        $this->assertSame(2, $campaign->fresh()->total_recipients);
    }

    public function test_exige_telefone_valido(): void
    {
        $user = $this->autenticar();
        $campaign = $this->campanha($user);

        $this->postJson("/api/v1/crm/campaigns/{$campaign->id}/recipients", [
            'full_name' => 'Sem telefone',
            'phone' => '   ',
        ])->assertUnprocessable();
    }
}
