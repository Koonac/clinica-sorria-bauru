<?php

namespace App\Listeners\Crm;

use App\Events\Crm\WhatsappMessageStored;
use App\Jobs\Crm\ProcessWhatsappAiReplyJob;
use App\Models\Clinic;
use App\Models\Crm\Agent;
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
        if (! $agent || ! $agent->canActivate()) {
            return;
        }

        if ($message->lead_id) {
            $paused = Lead::query()
                ->whereKey($message->lead_id)
                ->whereNotNull('whatsapp_agent_paused_at')
                ->exists();
            if ($paused) {
                return;
            }
        }

        $chatKey = $message->lead_id
            ? 'lead:'.$message->lead_id
            : 'jid:'.(string) $message->whatsapp_jid;

        if ($chatKey === 'jid:' || $chatKey === 'lead:0') {
            return;
        }

        $debounce = max(3, min(60, (int) $agent->debounce_seconds));

        ProcessWhatsappAiReplyJob::dispatch((int) $connectionId, $chatKey)
            ->delay(now()->addSeconds($debounce));
    }
}
