<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class RegisterWhatsappWebhooks
{
    /**
     * Reenvia as URLs de webhook da clínica para a sessão já autenticada.
     * Sem isso, um restart do wwebjs deixa a sessão connected mas muda/apaga o messages_url.
     */
    public function handle(Connection $connection): void
    {
        if (! filled($connection->session_id) || ! $connection->hasCredentials()) {
            return;
        }

        if (! filled($connection->webhook_token)) {
            $connection->webhook_token = Str::random(64);
            $connection->save();
        }

        $base = rtrim((string) config('app.url'), '/');
        $token = $connection->webhook_token;

        try {
            (new WhatsappApiClient($connection))->connect(
                (string) $connection->session_id,
                "{$base}/api/v1/crm/whatsapp/webhooks/notifications?token={$token}",
                "{$base}/api/v1/crm/whatsapp/webhooks/messages?token={$token}",
            );
        } catch (RuntimeException $e) {
            throw $e;
        } catch (Throwable $e) {
            throw new RuntimeException($e->getMessage(), 502, $e);
        }
    }
}
