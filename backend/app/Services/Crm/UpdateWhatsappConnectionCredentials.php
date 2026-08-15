<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;

class UpdateWhatsappConnectionCredentials
{
    public function __construct(private UpsertClinicConnection $upsert) {}

    /**
     * @param  array{api_username: string, api_password: string}  $attrs
     */
    public function handle(array $attrs, ?int $userId = null): Connection
    {
        $connection = $this->upsert->handle([], $userId);
        $connection->forceFill([
            'api_username' => $attrs['api_username'],
            'api_password' => $attrs['api_password'],
        ])->save();

        return $connection->fresh();
    }
}
