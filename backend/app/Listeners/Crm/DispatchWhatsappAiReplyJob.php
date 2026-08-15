<?php

namespace App\Listeners\Crm;

use App\Events\Crm\WhatsappMessageStored;
use App\Jobs\Crm\ProcessWhatsappAiReplyJob;
use App\Models\Crm\Agent;
use App\Models\Crm\Lead;

class DispatchWhatsappAiReplyJob
{
    public function handle(WhatsappMessageStored $event): void
    {
        $message = $event->message;
        if ($message->direction !== 'inbound') {
            return;
        }

        $user = $message->user ?? $message->user()->first();
        if (! $user) {
            return;
        }

        $agent = Agent::activeFor($user);
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

        ProcessWhatsappAiReplyJob::dispatch($user->id, $chatKey)
            ->delay(now()->addSeconds($debounce));
    }
}
