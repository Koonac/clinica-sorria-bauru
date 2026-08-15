<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class ConnectWhatsappConnection
{
    public function __construct(private UpsertClinicConnection $upsert) {}

    /**
     * @return array{connection: Connection, message: string}
     */
    public function handle(?int $userId = null): array
    {
        $connection = $this->upsert->handle([], $userId);

        if (! $connection->hasCredentials()) {
            throw new RuntimeException('Configure usuário e senha da WhatsApp API antes de conectar.', 422);
        }

        if (! filled($connection->session_id)) {
            $connection->session_id = (string) Str::uuid();
        }
        if (! filled($connection->webhook_token)) {
            $connection->webhook_token = Str::random(64);
        }
        $connection->save();

        $token = $connection->webhook_token;
        $base = rtrim((string) config('app.url'), '/');
        $notificationsUrl = "{$base}/api/v1/crm/whatsapp/webhooks/notifications?token={$token}";
        $messagesUrl = "{$base}/api/v1/crm/whatsapp/webhooks/messages?token={$token}";

        $client = new WhatsappApiClient($connection);

        try {
            if (in_array($connection->status, ['connecting', 'connected', 'error'], true)) {
                try {
                    $client->disconnect((string) $connection->session_id);
                } catch (Throwable) {
                    // Sessão pode já estar morta na API.
                }
            }

            $client->connect((string) $connection->session_id, $notificationsUrl, $messagesUrl);
        } catch (RuntimeException $e) {
            $connection->status = 'error';
            $connection->save();

            throw $e;
        }

        $connection->forceFill([
            'status' => 'connecting',
            'qr' => null,
        ])->save();

        return [
            'connection' => $connection->fresh(),
            'message' => 'Conexão iniciada. Escaneie o QR Code.',
        ];
    }
}
