<?php

namespace App\Services\Crm;

class CreateCalendarEvent
{
    public function __construct(private GoogleCalendarClient $calendar) {}

    /**
     * @param  array{summary: string, start: string, end: string, all_day?: bool, description?: string|null, location?: string|null}  $attrs
     * @return array{id: string, summary: string, description: string, location: string, htmlLink: string|null, allDay: bool, start: string|null, end: string|null}
     */
    public function handle(array $attrs): array
    {
        $payload = [
            'summary' => $attrs['summary'],
            'start' => $attrs['start'],
            'end' => $attrs['end'],
            'allDay' => (bool) ($attrs['all_day'] ?? false),
            'description' => $attrs['description'] ?? '',
        ];
        if (array_key_exists('location', $attrs)) {
            $payload['location'] = $attrs['location'] ?? '';
        }

        return $this->calendar->createEvent($payload);
    }
}
