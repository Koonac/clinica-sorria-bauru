<?php

namespace App\Services\Crm;

class DeleteCalendarEvent
{
    public function __construct(private GoogleCalendarClient $calendar) {}

    /**
     * @return array{ok: true, id: string}
     */
    public function handle(string $eventId): array
    {
        $this->calendar->deleteEvent($eventId);

        return ['ok' => true, 'id' => $eventId];
    }
}
