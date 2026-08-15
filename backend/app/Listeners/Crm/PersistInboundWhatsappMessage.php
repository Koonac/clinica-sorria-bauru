<?php

namespace App\Listeners\Crm;

use App\Events\Crm\WhatsappInboundMessageReceived;
use App\Events\Crm\WhatsappMessageStored;
use App\Services\Crm\PauseWhatsappAgentForLead;
use App\Services\Crm\ProcessInboundWhatsappMessage;

class PersistInboundWhatsappMessage
{
    public function __construct(
        private ProcessInboundWhatsappMessage $processor,
        private PauseWhatsappAgentForLead $pauseAgent,
    ) {}

    public function handle(WhatsappInboundMessageReceived $event): void
    {
        $message = $this->processor->handle(
            $event->user,
            $event->sessionId,
            $event->payload,
        );

        if (! $message) {
            return;
        }

        // Outbound novo vindo do celular (from_me) — pausa o agent neste lead.
        // Envios da API/agent já existem por message_id e não chegam aqui.
        if ($message->direction === 'outbound' && $message->lead_id) {
            $lead = $message->lead;
            if ($lead) {
                $this->pauseAgent->handle(
                    $lead,
                    $event->user,
                    'phone',
                    is_string($message->body) ? mb_substr($message->body, 0, 500) : null,
                );
            }
        }

        WhatsappMessageStored::dispatch($message);
    }
}
