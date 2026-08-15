<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;
use Throwable;

class DisconnectWhatsappConnection
{
    public function __construct(private UpsertClinicConnection $upsert) {}

    public function handle(?int $userId = null): Connection
    {
        $connection = $this->upsert->handle([], $userId);

        if (filled($connection->session_id) && $connection->hasCredentials()) {
            try {
                (new WhatsappApiClient($connection))->disconnect((string) $connection->session_id);
            } catch (Throwable) {
                // Segue limpando o estado local mesmo se a API falhar.
            }
        }

        $connection->forceFill([
            'status' => 'disconnected',
            'is_business' => false,
            'qr' => null,
            'phone' => null,
        ])->save();

        return $connection->fresh();
    }
}
