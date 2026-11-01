<?php

namespace App\Services\Crm;

class CalendarStatus
{
    public function __construct(private GoogleCalendarClient $calendar) {}

    /**
     * @return array{configured: bool, provedor: 'google'|'crm_tasks', calendar_id: string|null}
     */
    public function handle(): array
    {
        $configured = $this->calendar->configured();

        return [
            'configured' => $configured,
            'provedor' => $configured ? 'google' : 'crm_tasks',
            'calendar_id' => $configured ? $this->calendar->calendarId() : null,
        ];
    }
}
