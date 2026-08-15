<?php

namespace Tests;

use App\Models\Clinic;
use App\Models\Crm\Connection;
use App\Models\User;
use App\Support\ClinicContext;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function defaultClinic(): Clinic
    {
        $clinic = Clinic::query()->where('slug', 'sorria-bauru')->first()
            ?? Clinic::query()->orderBy('id')->firstOrFail();

        app(ClinicContext::class)->set($clinic);

        return $clinic;
    }

    /**
     * @param  array<string, mixed>  $connectionAttrs
     * @return array{0: User, 1: Connection}
     */
    protected function userWithWhatsappConnection(array $connectionAttrs = []): array
    {
        $clinic = $this->defaultClinic();

        $user = User::factory()->create([
            'clinic_id' => $clinic->id,
            'role' => User::ROLE_ADMIN,
        ]);

        $connection = Connection::withoutGlobalScopes()->updateOrCreate(
            ['clinic_id' => $clinic->id],
            array_merge([
                'name' => 'WhatsApp principal',
                'api_username' => 'u',
                'api_password' => 'p',
                'session_id' => 'sess-1',
                'webhook_token' => 'webhook-token-test-'.uniqid(),
                'status' => 'connected',
                'is_business' => false,
                'created_by' => $user->id,
            ], $connectionAttrs),
        );

        return [$user, $connection];
    }
}
