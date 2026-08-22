<?php

namespace Tests\Feature;

use App\Models\Crm\Contact;
use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappMessage;
use App\Services\Crm\EnsureWhatsappChatLead;
use App\Services\Crm\WhatsappLeadResolver;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WhatsappLeadLinkTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CrmSeeder::class);
        $this->defaultClinic();
    }

    public function test_resolver_cria_lead_novo_quando_contact_existe_sem_lead_aberto(): void
    {
        [$user, $connection] = $this->userWithWhatsappConnection();

        $jid = '5511999887766@c.us';
        $contact = Contact::create([
            'name' => 'Guilherme Buso',
            'mobile' => '5511999887766',
            'whatsapp_jid' => $jid,
        ]);

        Lead::create([
            'title' => 'Guilherme Buso',
            'name' => 'Guilherme Buso',
            'status' => 'converted',
            'mobile' => '5511999887766',
            'whatsapp_jid' => $jid,
            'contact_id' => $contact->id,
            'owner_id' => $user->id,
            'converted_at' => now(),
        ]);

        $resolved = app(WhatsappLeadResolver::class)->resolve($connection, [
            'jid' => $jid,
            'phone_number' => '5511999887766',
            'contact_name' => 'Guilherme Buso',
        ], $user);

        $this->assertNotNull($resolved['lead']);
        $this->assertSame('new', $resolved['lead']->status);
        $this->assertSame($contact->id, $resolved['lead']->contact_id);
        $this->assertSame($jid, $resolved['lead']->whatsapp_jid);
        $this->assertSame('Guilherme Buso', $resolved['lead']->name);
        $this->assertSame($contact->id, $resolved['contact']?->id);
    }

    public function test_ensure_lead_e_idempotente_quando_ja_existe_lead_aberto(): void
    {
        [$user, $connection] = $this->userWithWhatsappConnection();
        Sanctum::actingAs($user);

        $jid = '5511888777666@c.us';
        $contact = Contact::create([
            'name' => 'Ana',
            'mobile' => '5511888777666',
            'whatsapp_jid' => $jid,
        ]);
        $lead = Lead::create([
            'title' => 'Ana',
            'name' => 'Ana',
            'status' => 'new',
            'mobile' => '5511888777666',
            'whatsapp_jid' => $jid,
            'contact_id' => $contact->id,
            'owner_id' => $user->id,
        ]);

        $first = $this->postJson('/api/v1/crm/whatsapp/chats/ensure-lead', [
            'jid' => $jid,
            'phone_number' => '5511888777666',
            'contact_name' => 'Ana',
        ])->assertOk()
            ->json('data');

        $second = $this->postJson('/api/v1/crm/whatsapp/chats/ensure-lead', [
            'jid' => $jid,
            'phone_number' => '5511888777666',
        ])->assertOk()
            ->json('data');

        $this->assertSame($lead->id, $first['lead_id']);
        $this->assertSame($lead->id, $second['lead_id']);
        $this->assertSame(1, Lead::query()->where('whatsapp_jid', $jid)->where('status', '!=', 'converted')->count());
    }

    public function test_ensure_lead_cria_lead_para_conversa_orfao(): void
    {
        [$user, $connection] = $this->userWithWhatsappConnection();
        Sanctum::actingAs($user);

        $jid = '5511777666555@c.us';
        $contact = Contact::create([
            'name' => 'Sócio',
            'mobile' => '5511777666555',
            'whatsapp_jid' => $jid,
        ]);
        Lead::create([
            'title' => 'Sócio',
            'name' => 'Sócio',
            'status' => 'converted',
            'mobile' => '5511777666555',
            'whatsapp_jid' => $jid,
            'contact_id' => $contact->id,
            'owner_id' => $user->id,
            'converted_at' => now(),
        ]);

        $response = $this->postJson('/api/v1/crm/whatsapp/chats/ensure-lead', [
            'jid' => $jid,
            'phone_number' => '5511777666555',
            'contact_name' => 'Sócio',
        ])->assertOk()
            ->json('data');

        $this->assertNotNull($response['lead_id']);
        $this->assertSame($contact->id, $response['contact_id']);
        $this->assertDatabaseHas('leads', [
            'id' => $response['lead_id'],
            'status' => 'new',
            'contact_id' => $contact->id,
            'whatsapp_jid' => $jid,
        ]);
    }

    public function test_listagem_de_chats_usa_fallback_de_lead_aberto(): void
    {
        if (\Illuminate\Support\Facades\DB::connection()->getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Listagem de chats usa SQL PostgreSQL (DISTINCT ON).');
        }

        [$user, $connection] = $this->userWithWhatsappConnection();
        Sanctum::actingAs($user);

        $jid = '5511666555444@c.us';
        $contact = Contact::create([
            'name' => 'Cliente Orfão',
            'mobile' => '5511666555444',
            'whatsapp_jid' => $jid,
        ]);
        $openLead = Lead::create([
            'title' => 'Cliente Orfão',
            'name' => 'Cliente Orfão',
            'status' => 'contacted',
            'mobile' => '5511666555444',
            'whatsapp_jid' => $jid,
            'contact_id' => $contact->id,
            'owner_id' => $user->id,
        ]);

        WhatsappMessage::create([
            'connection_id' => $connection->id,
            'user_id' => $user->id,
            'session_id' => $connection->session_id,
            'whatsapp_jid' => $jid,
            'phone_number' => '5511666555444',
            'contact_name' => 'Cliente Orfão',
            'direction' => 'inbound',
            'body' => 'oi',
            'message_id' => 'msg-orphan-1',
            'type' => 'chat',
            'has_media' => false,
            'lead_id' => null,
            'contact_id' => $contact->id,
            'wa_timestamp' => now(),
        ]);

        $chats = $this->getJson('/api/v1/crm/whatsapp/chats')
            ->assertOk()
            ->json('data');

        $chat = collect($chats)->firstWhere('whatsapp_jid', $jid);
        $this->assertNotNull($chat);
        $this->assertSame($openLead->id, $chat['lead_id']);
        $this->assertSame($user->id, $chat['owner_id']);
    }

    public function test_fallback_encontra_lead_aberto_por_jid_ou_contact_quando_msg_sem_lead(): void
    {
        [$user] = $this->userWithWhatsappConnection();

        $jid = '5511444333222@c.us';
        $contact = Contact::create([
            'name' => 'Cliente Fallback',
            'mobile' => '5511444333222',
            'whatsapp_jid' => $jid,
        ]);
        $openLead = Lead::create([
            'title' => 'Cliente Fallback',
            'name' => 'Cliente Fallback',
            'status' => 'qualified',
            'mobile' => '5511444333222',
            'whatsapp_jid' => $jid,
            'contact_id' => $contact->id,
            'owner_id' => $user->id,
        ]);

        // Espelha o critério do fallback da listagem de chats.
        $found = Lead::query()
            ->where('status', '!=', 'converted')
            ->where(function ($q) use ($jid, $contact) {
                $q->where('whatsapp_jid', $jid)
                    ->orWhere('contact_id', $contact->id);
            })
            ->orderByDesc('id')
            ->first();

        $this->assertNotNull($found);
        $this->assertSame($openLead->id, $found->id);
    }

    public function test_ensure_service_retorna_payload_do_chat(): void
    {
        [$user, $connection] = $this->userWithWhatsappConnection();

        $jid = '5511555444333@c.us';
        Contact::create([
            'name' => 'Pedro',
            'mobile' => '5511555444333',
            'whatsapp_jid' => $jid,
        ]);

        $data = app(EnsureWhatsappChatLead::class)->handle($connection, [
            'jid' => $jid,
            'phone_number' => '5511555444333',
            'contact_name' => 'Pedro',
        ], $user);

        $this->assertArrayHasKey('lead_id', $data);
        $this->assertSame('Pedro', $data['contact_name']);
        $this->assertSame($jid, $data['whatsapp_jid']);
    }
}
