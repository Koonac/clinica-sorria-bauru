<?php

namespace Tests\Feature;

use App\Models\Clinic;
use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use App\Services\Crm\PruneWhatsappMedia;
use App\Services\Crm\WhatsappMediaStore;
use App\Support\ClinicContext;
use Database\Seeders\CrmSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class WhatsappMediaPruneTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CrmSeeder::class);
        Storage::fake('local');
        config([
            'services.whatsapp.media_retention_days' => 90,
            'services.whatsapp.media_max_mb_per_clinic' => 1,
        ]);
    }

    /**
     * @return array{0: User, 1: Connection}
     */
    private function userConectado(): array
    {
        return $this->userWithWhatsappConnection();
    }

    private function leadComWhatsapp(User $user): Lead
    {
        return Lead::create([
            'title' => 'L',
            'name' => 'Ana',
            'mobile' => '5511999990000',
            'whatsapp_jid' => '5511999990000@c.us',
            'owner_id' => $user->id,
        ]);
    }

    private function inboundComMidia(
        User $user,
        Connection $connection,
        Lead $lead,
        string $bytes,
        ?\DateTimeInterface $createdAt = null,
    ): WhatsappMessage {
        $message = WhatsappMessage::create([
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $user->id,
            'session_id' => 'sess-1',
            'whatsapp_jid' => '5511999990000@c.us',
            'phone_number' => '5511999990000',
            'contact_name' => $lead->name,
            'direction' => 'inbound',
            'body' => null,
            'message_id' => 'msg-'.uniqid(),
            'type' => 'image',
            'has_media' => true,
            'lead_id' => $lead->id,
            'wa_timestamp' => now(),
        ]);

        $store = app(WhatsappMediaStore::class);
        $message->forceFill([
            'media' => array_merge(
                $store->store($message, base64_encode($bytes), [
                    'mimetype' => 'image/png',
                    'filename' => 'foto.png',
                ]),
                ['transcript' => 'texto extraído'],
            ),
        ])->save();

        if ($createdAt !== null) {
            WhatsappMessage::withoutGlobalScopes()
                ->where('id', $message->id)
                ->update(['created_at' => $createdAt, 'updated_at' => $createdAt]);
        }

        return $message->fresh();
    }

    public function test_expira_arquivo_antigo_e_preserva_mensagem(): void
    {
        [$user, $connection] = $this->userConectado();
        $lead = $this->leadComWhatsapp($user);
        $old = $this->inboundComMidia($user, $connection, $lead, 'png-old', now()->subDays(91));
        $recent = $this->inboundComMidia($user, $connection, $lead, 'png-new');

        $oldPath = $old->mediaPath();
        $recentPath = $recent->mediaPath();
        $this->assertNotNull($oldPath);
        $this->assertTrue(Storage::disk('local')->exists($oldPath));

        $result = app(PruneWhatsappMedia::class)->handle();

        $this->assertSame(1, $result['expired']);
        $this->assertFalse(Storage::disk('local')->exists($oldPath));
        $this->assertTrue(Storage::disk('local')->exists($recentPath));

        $old = $old->fresh();
        $this->assertNotNull($old);
        $this->assertSame('texto extraído', $old->mediaTranscript());
        $this->assertNull($old->mediaPath());
        $this->assertNotNull($old->media['purged_at'] ?? null);
        $this->assertNull($old->media_url);
    }

    public function test_teto_por_clinica_apaga_os_mais_antigos(): void
    {
        [$user, $connection] = $this->userConectado();
        $lead = $this->leadComWhatsapp($user);
        $chunk = str_repeat('a', 600_000);

        $oldest = $this->inboundComMidia($user, $connection, $lead, $chunk, now()->subDays(10));
        $newer = $this->inboundComMidia($user, $connection, $lead, $chunk, now()->subDays(2));

        $other = Clinic::query()->create([
            'name' => 'Outra',
            'slug' => 'outra-clinica',
            'is_active' => true,
        ]);
        app(ClinicContext::class)->set($other);
        $otherUser = User::factory()->create(['clinic_id' => $other->id, 'role' => User::ROLE_ADMIN]);
        $otherConnection = Connection::withoutGlobalScopes()->create([
            'clinic_id' => $other->id,
            'name' => 'WA',
            'api_username' => 'u',
            'api_password' => 'p',
            'session_id' => 'sess-other',
            'webhook_token' => 'tok-other',
            'status' => 'connected',
            'created_by' => $otherUser->id,
        ]);
        $otherLead = Lead::withoutGlobalScopes()->create([
            'clinic_id' => $other->id,
            'title' => 'L2',
            'name' => 'Bia',
            'mobile' => '5511988880000',
            'whatsapp_jid' => '5511988880000@c.us',
            'owner_id' => $otherUser->id,
        ]);
        $otherMsg = $this->inboundComMidia($otherUser, $otherConnection, $otherLead, $chunk);

        $result = app(PruneWhatsappMedia::class)->handle();

        $this->assertSame(1, $result['capped']);
        $this->assertNull(
            WhatsappMessage::withoutGlobalScopes()->find($oldest->id)?->mediaPath(),
        );
        $this->assertNotNull(
            WhatsappMessage::withoutGlobalScopes()->find($newer->id)?->mediaPath(),
        );
        $this->assertNotNull(
            WhatsappMessage::withoutGlobalScopes()->find($otherMsg->id)?->mediaPath(),
        );
    }

    public function test_dry_run_nao_apaga(): void
    {
        [$user, $connection] = $this->userConectado();
        $lead = $this->leadComWhatsapp($user);
        $old = $this->inboundComMidia($user, $connection, $lead, 'png-old', now()->subDays(120));
        $path = $old->mediaPath();

        $result = app(PruneWhatsappMedia::class)->handle(true);

        $this->assertSame(1, $result['expired']);
        $this->assertTrue(Storage::disk('local')->exists($path));
        $this->assertNotNull($old->fresh()->mediaPath());
    }

    public function test_apaga_arquivo_orfao(): void
    {
        Storage::disk('local')->put(WhatsappMediaStore::DIRECTORY.'/1/999999.bin', 'lixo');

        $result = app(PruneWhatsappMedia::class)->handle();

        $this->assertSame(1, $result['orphans']);
        $this->assertFalse(Storage::disk('local')->exists(WhatsappMediaStore::DIRECTORY.'/1/999999.bin'));
    }

    public function test_comando_artisan_roda(): void
    {
        $this->artisan('crm:prune-whatsapp-media')
            ->assertSuccessful();

        Artisan::call('crm:prune-whatsapp-media', ['--dry-run' => true]);
        $this->assertStringContainsString('dry-run', Artisan::output());
    }
}
