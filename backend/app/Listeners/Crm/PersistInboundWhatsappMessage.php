<?php

namespace App\Listeners\Crm;

use App\Events\Crm\WhatsappInboundMessageReceived;
use App\Events\Crm\WhatsappMessageStored;
use App\Models\User;
use App\Services\Crm\PauseWhatsappAgentForLead;
use App\Services\Crm\ProcessInboundWhatsappMessage;
use App\Services\Crm\ScheduleWhatsappAttendanceAutoClose;

class PersistInboundWhatsappMessage
{
    public function __construct(
        private ProcessInboundWhatsappMessage $processor,
        private PauseWhatsappAgentForLead $pauseAgent,
        private ScheduleWhatsappAttendanceAutoClose $autoClose,
    ) {}

    public function handle(WhatsappInboundMessageReceived $event): void
    {
        $message = $this->processor->handle(
            $event->connection,
            $event->sessionId,
            $event->payload,
        );

        if (! $message) {
            return;
        }

        if ($message->direction === 'outbound' && $message->lead_id) {
            $lead = $message->lead;
            $user = $event->connection->created_by
                ? User::query()->find($event->connection->created_by)
                : null;

            if ($lead && $user) {
                $this->pauseAgent->handle(
                    $lead,
                    $user,
                    'phone',
                    $event->connection,
                    is_string($message->body) ? mb_substr($message->body, 0, 500) : null,
                );
                $this->autoClose->handle($lead->fresh() ?? $lead, $event->connection);
            }
        }

        WhatsappMessageStored::dispatch($message);
    }
}
