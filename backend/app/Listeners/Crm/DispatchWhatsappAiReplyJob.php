<?php

namespace App\Listeners\Crm;

use App\Events\Crm\WhatsappMessageStored;
use App\Jobs\Crm\ProcessWhatsappAiReplyJob;
use App\Models\Clinic;
use App\Models\Crm\Agent;
use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use App\Support\ClinicContext;

class DispatchWhatsappAiReplyJob
{
    public function handle(WhatsappMessageStored $event): void
    {
        $message = $event->message;
        if ($message->direction !== 'inbound') {
            return;
        }

        $connectionId = $message->connection_id;
        $clinicId = $message->clinic_id;
        if (! $connectionId || ! $clinicId) {
            return;
        }

        $clinic = Clinic::query()->find($clinicId);
        if (! $clinic) {
            return;
        }

        app(ClinicContext::class)->set($clinic);

        $agent = Agent::activeForClinic((int) $clinicId);
        if (! $agent || ! $agent->canActivate() || ! $agent->isWorkingAt()) {
            return;
        }

        $lead = $message->lead_id
            ? Lead::query()->find($message->lead_id, ['id', 'mobile', 'whatsapp_jid', 'whatsapp_agent_paused_at'])
            : null;
        if ($lead?->whatsapp_agent_paused_at !== null) {
            return;
        }

        // Modo de teste: a IA só responde ao número configurado.
        $connection = Connection::withoutGlobalScopes()->find($connectionId);
        if ($connection && ! $connection->allowsAutomationFor(
            $message->whatsapp_jid,
            $message->phone_number,
            $lead?->mobile,
            $lead?->whatsapp_jid,
        )) {
            return;
        }

        $chatKey = $message->lead_id
            ? 'lead:'.$message->lead_id
            : 'jid:'.(string) $message->whatsapp_jid;

        if ($chatKey === 'jid:' || $chatKey === 'lead:0') {
            return;
        }

        $debounce = max(3, min(60, (int) $agent->debounce_seconds));

        ProcessWhatsappAiReplyJob::dispatch((int) $connectionId, $chatKey, now()->timestamp)
            ->delay(now()->addSeconds($debounce));
    }
}
