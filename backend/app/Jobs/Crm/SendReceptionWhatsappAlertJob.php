<?php

namespace App\Jobs\Crm;

use App\Models\Crm\Connection;
use App\Models\Crm\CrmNotification;
use App\Models\Crm\Lead;
use App\Services\Crm\WhatsappApiClient;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Replica o aviso do sino no WhatsApp da recepção (número ou grupo configurado na conexão).
 * Não grava em whatsapp_messages: não é conversa com paciente.
 */
class SendReceptionWhatsappAlertJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public function __construct(public int $notificationId) {}

    public function handle(): void
    {
        $notification = CrmNotification::withoutGlobalScopes()->find($this->notificationId);
        if (! $notification) {
            return;
        }

        $connection = Connection::withoutGlobalScopes()
            ->where('clinic_id', $notification->clinic_id)
            ->first();

        $to = trim((string) ($connection?->reception_alert_jid ?? ''));
        if (! $connection || $to === '' || $connection->status !== 'connected'
            || ! filled($connection->session_id) || ! $connection->hasCredentials()) {
            return;
        }

        $lead = $notification->lead_id
            ? Lead::withoutGlobalScopes()->find($notification->lead_id)
            : null;

        $icon = $notification->priority === CrmNotification::PRIORITY_URGENT ? "\u{1F6A8}" : "\u{1F514}";
        $lines = ["{$icon} *".$notification->title.'*'];
        if (filled($notification->body)) {
            $lines[] = (string) $notification->body;
        }
        if ($lead) {
            $lines[] = 'Paciente: '.trim(($lead->name ?? '').' '.($lead->mobile ?? ''));
        }

        try {
            (new WhatsappApiClient($connection))->send((string) $connection->session_id, $to, implode("\n", $lines));
        } catch (Throwable $e) {
            Log::warning('Falha ao alertar WhatsApp da recepção.', [
                'notification_id' => $notification->id,
                'message' => $e->getMessage(),
            ]);
        }
    }
}
