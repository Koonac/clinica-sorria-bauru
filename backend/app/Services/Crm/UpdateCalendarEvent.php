<?php

namespace App\Services\Crm;

class UpdateCalendarEvent
{
    public function __construct(private GoogleCalendarClient $calendar) {}

    /**
     * @param  array{summary?: string, start?: string, end?: string, all_day?: bool, description?: string|null, location?: string|null}  $attrs
     * @return array{id: string, summary: string, description: string, location: string, htmlLink: string|null, allDay: bool, start: string|null, end: string|null}
     */
    public function handle(string $eventId, array $attrs): array
    {
        $payload = [];
        if (array_key_exists('summary', $attrs)) {
            $payload['summary'] = $attrs['summary'];
        }
        if (array_key_exists('description', $attrs)) {
            $payload['description'] = $attrs['description'] ?? '';
        }
        if (array_key_exists('location', $attrs)) {
            $payload['location'] = $attrs['location'] ?? '';
        }
        if (isset($attrs['start'], $attrs['end'])) {
            $payload['start'] = $attrs['start'];
            $payload['end'] = $attrs['end'];
            $payload['allDay'] = (bool) ($attrs['all_day'] ?? false);
        }

        return $this->calendar->updateEvent($eventId, $payload);
    }
}
