<?php

namespace App\Services\Crm;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class GoogleCalendarClient
{
    private const TOKEN_URL = 'https://www.googleapis.com/oauth2/v3/token';

    private const API_BASE = 'https://www.googleapis.com/calendar/v3';

    public function configured(): bool
    {
        $cfg = config('services.google_calendar', []);

        return filled($cfg['client_id'] ?? null)
            && filled($cfg['client_secret'] ?? null)
            && filled($cfg['refresh_token'] ?? null);
    }

    public function calendarId(): string
    {
        $id = trim((string) config('services.google_calendar.calendar_id', 'primary'));

        return $id !== '' ? $id : 'primary';
    }

    /**
     * @param  array{summary: string, description?: string|null, location?: string|null, start: string, end: string, allDay?: bool}  $payload
     * @return array{id: string, summary: string, description: string, htmlLink: string|null, start: string|null, end: string|null}
     */
    public function createEvent(array $payload): array
    {
        if (! $this->configured()) {
            throw new RuntimeException('Google Calendar não configurado. Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_CALENDAR_REFRESH_TOKEN.');
        }

        $allDay = (bool) ($payload['allDay'] ?? false);
        $body = [
            'summary' => trim((string) ($payload['summary'] ?? '')),
            'description' => (string) ($payload['description'] ?? ''),
            'start' => $this->dateTimeValue($payload['start'] ?? '', $allDay),
            'end' => $this->dateTimeValue($payload['end'] ?? '', $allDay),
        ];
        if ($body['summary'] === '') {
            throw new RuntimeException('Título do evento é obrigatório.');
        }
        if (isset($payload['location'])) {
            $body['location'] = (string) $payload['location'];
        }

        $token = $this->accessToken();
        $calendarId = rawurlencode($this->calendarId());
        $response = Http::withToken($token)
            ->acceptJson()
            ->timeout(30)
            ->post(self::API_BASE.'/calendars/'.$calendarId.'/events', $body);

        if ($response->failed()) {
            $detail = $response->json('error.message')
                ?? $response->json('error_description')
                ?? mb_substr($response->body(), 0, 300);
            throw new RuntimeException('Google Calendar erro ('.$response->status().'): '.$detail);
        }

        $ev = $response->json();
        if (! is_array($ev) || empty($ev['id'])) {
            throw new RuntimeException('Google Calendar não retornou o evento criado.');
        }

        $isAllDay = ! empty($ev['start']['date']) && empty($ev['start']['dateTime']);

        return [
            'id' => (string) $ev['id'],
            'summary' => (string) ($ev['summary'] ?? $body['summary']),
            'description' => (string) ($ev['description'] ?? ''),
            'htmlLink' => isset($ev['htmlLink']) ? (string) $ev['htmlLink'] : null,
            'start' => $isAllDay
                ? ($ev['start']['date'] ?? null)
                : ($ev['start']['dateTime'] ?? null),
            'end' => $isAllDay
                ? ($ev['end']['date'] ?? null)
                : ($ev['end']['dateTime'] ?? null),
        ];
    }

    /**
     * @param  array{summary?: string, description?: string|null, location?: string|null, start?: string, end?: string, allDay?: bool}  $payload
     * @return array{id: string, summary: string, description: string, htmlLink: string|null, start: string|null, end: string|null}
     */
    public function updateEvent(string $eventId, array $payload): array
    {
        if (! $this->configured()) {
            throw new RuntimeException('Google Calendar não configurado.');
        }

        $eventId = trim($eventId);
        if ($eventId === '') {
            throw new RuntimeException('ID do evento é obrigatório.');
        }

        $body = [];
        if (array_key_exists('summary', $payload)) {
            $body['summary'] = trim((string) $payload['summary']);
        }
        if (array_key_exists('description', $payload)) {
            $body['description'] = (string) $payload['description'];
        }
        if (array_key_exists('location', $payload)) {
            $body['location'] = (string) $payload['location'];
        }
        if (isset($payload['start'], $payload['end'])) {
            $allDay = (bool) ($payload['allDay'] ?? false);
            $body['start'] = $this->dateTimeValue((string) $payload['start'], $allDay);
            $body['end'] = $this->dateTimeValue((string) $payload['end'], $allDay);
        }
        if ($body === []) {
            throw new RuntimeException('Nenhum campo para atualizar.');
        }

        $token = $this->accessToken();
        $calendarId = rawurlencode($this->calendarId());
        $response = Http::withToken($token)
            ->acceptJson()
            ->timeout(30)
            ->patch(
                self::API_BASE.'/calendars/'.$calendarId.'/events/'.rawurlencode($eventId),
                $body,
            );

        if ($response->failed()) {
            $detail = $response->json('error.message')
                ?? $response->json('error_description')
                ?? mb_substr($response->body(), 0, 300);
            throw new RuntimeException('Google Calendar erro ao atualizar ('.$response->status().'): '.$detail);
        }

        $ev = $response->json();
        if (! is_array($ev) || empty($ev['id'])) {
            throw new RuntimeException('Google Calendar não retornou o evento atualizado.');
        }

        $isAllDay = ! empty($ev['start']['date']) && empty($ev['start']['dateTime']);

        return [
            'id' => (string) $ev['id'],
            'summary' => (string) ($ev['summary'] ?? ''),
            'description' => (string) ($ev['description'] ?? ''),
            'htmlLink' => isset($ev['htmlLink']) ? (string) $ev['htmlLink'] : null,
            'start' => $isAllDay
                ? ($ev['start']['date'] ?? null)
                : ($ev['start']['dateTime'] ?? null),
            'end' => $isAllDay
                ? ($ev['end']['date'] ?? null)
                : ($ev['end']['dateTime'] ?? null),
        ];
    }

    public function deleteEvent(string $eventId): void
    {
        if (! $this->configured()) {
            throw new RuntimeException('Google Calendar não configurado.');
        }

        $eventId = trim($eventId);
        if ($eventId === '') {
            throw new RuntimeException('ID do evento é obrigatório.');
        }

        $token = $this->accessToken();
        $calendarId = rawurlencode($this->calendarId());
        $response = Http::withToken($token)
            ->acceptJson()
            ->timeout(30)
            ->delete(self::API_BASE.'/calendars/'.$calendarId.'/events/'.rawurlencode($eventId));

        // 404/410: já removido — trata como sucesso.
        if ($response->failed() && ! in_array($response->status(), [404, 410], true)) {
            $detail = $response->json('error.message')
                ?? $response->json('error_description')
                ?? mb_substr($response->body(), 0, 300);
            throw new RuntimeException('Google Calendar erro ao excluir ('.$response->status().'): '.$detail);
        }
    }

    /**
     * FreeBusy: retorna apenas intervalos ocupados (sem título/descrição de eventos).
     *
     * @return list<array{start: string, end: string}>
     */
    public function freeBusy(string $timeMinIso, string $timeMaxIso): array
    {
        if (! $this->configured()) {
            throw new RuntimeException('Google Calendar não configurado.');
        }

        $token = $this->accessToken();
        $response = Http::withToken($token)
            ->acceptJson()
            ->timeout(30)
            ->post(self::API_BASE.'/freeBusy', [
                'timeMin' => $this->dateTimeValue($timeMinIso, false)['dateTime'],
                'timeMax' => $this->dateTimeValue($timeMaxIso, false)['dateTime'],
                'timeZone' => (string) config('services.google_calendar.timezone', 'America/Sao_Paulo'),
                'items' => [
                    ['id' => $this->calendarId()],
                ],
            ]);

        if ($response->failed()) {
            $detail = $response->json('error.message')
                ?? $response->json('error_description')
                ?? mb_substr($response->body(), 0, 300);
            throw new RuntimeException('Google Calendar FreeBusy erro ('.$response->status().'): '.$detail);
        }

        $calId = $this->calendarId();
        $busy = $response->json("calendars.{$calId}.busy");
        if (! is_array($busy)) {
            // Fallback: primeiro calendário retornado.
            $calendars = $response->json('calendars');
            $busy = [];
            if (is_array($calendars)) {
                foreach ($calendars as $cal) {
                    if (is_array($cal['busy'] ?? null)) {
                        $busy = $cal['busy'];
                        break;
                    }
                }
            }
        }

        $out = [];
        foreach ($busy as $block) {
            if (! is_array($block)) {
                continue;
            }
            $start = (string) ($block['start'] ?? '');
            $end = (string) ($block['end'] ?? '');
            if ($start === '' || $end === '') {
                continue;
            }
            $out[] = ['start' => $start, 'end' => $end];
        }

        return $out;
    }

    private function accessToken(): string
    {
        $cfg = config('services.google_calendar', []);
        $response = Http::asForm()->timeout(30)->post(self::TOKEN_URL, [
            'grant_type' => 'refresh_token',
            'client_id' => $cfg['client_id'],
            'client_secret' => $cfg['client_secret'],
            'refresh_token' => $cfg['refresh_token'],
        ]);

        if ($response->failed() || ! filled($response->json('access_token'))) {
            $detail = $response->json('error_description')
                ?? $response->json('error')
                ?? mb_substr($response->body(), 0, 300);
            throw new RuntimeException('Falha ao renovar token OAuth do Google Calendar: '.$detail);
        }

        return (string) $response->json('access_token');
    }

    /**
     * @return array{date: string}|array{dateTime: string}
     */
    private function dateTimeValue(string $value, bool $allDay): array
    {
        $value = trim($value);
        if ($allDay) {
            $date = substr($value, 0, 10);
            if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                throw new RuntimeException('Data de dia inteiro inválida (use YYYY-MM-DD).');
            }

            return ['date' => $date];
        }

        if ($value === '') {
            throw new RuntimeException('Data/hora obrigatória.');
        }

        try {
            $dt = new \DateTimeImmutable($value);
        } catch (\Exception) {
            throw new RuntimeException('Data/hora inválida.');
        }

        return ['dateTime' => $dt->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z')];
    }
}
