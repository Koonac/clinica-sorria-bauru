<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;
use Illuminate\Support\Facades\Crypt;
use Throwable;

class UpdateWhatsappConnectionCredentials
{
    public function __construct(private UpsertClinicConnection $upsert) {}

    /**
     * @param  array{api_username: string, api_password: string}  $attrs
     */
    public function handle(array $attrs, ?int $userId = null): Connection
    {
        $connection = $this->upsert->handle([], $userId);

        Connection::withoutGlobalScopes()
            ->whereKey($connection->id)
            ->update([
                'api_username' => $attrs['api_username'],
                'api_password' => $this->persistPassword($attrs['api_password']),
            ]);

        return $connection->refresh();
    }

    private function persistPassword(string $password): string
    {
        try {
            return Crypt::encrypt($password, false);
        } catch (Throwable) {
            return $password;
        }
    }
}
