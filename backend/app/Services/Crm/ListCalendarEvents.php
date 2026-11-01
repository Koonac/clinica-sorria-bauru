<?php

namespace App\Services\Crm;

class ListCalendarEvents
{
    public function __construct(private GoogleCalendarClient $calendar) {}

    /**
     * @return list<array{id: string, summary: string, description: string, location: string, htmlLink: string|null, allDay: bool, start: string|null, end: string|null}>
     */
    public function handle(string $timeMin, string $timeMax): array
    {
        return $this->calendar->listEvents($timeMin, $timeMax);
    }
}
