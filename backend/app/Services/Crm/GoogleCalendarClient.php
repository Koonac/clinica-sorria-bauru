<?php

namespace App\Services\Crm;

use App\Models\Clinic;
use App\Support\ClinicContext;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class GoogleCalendarClient
{
    private const TOKEN_URL = 'https://www.googleapis.com/oauth2/v3/token';

    private const API_BASE = 'https://www.googleapis.com/calendar/v3';

    public function __construct(private ClinicContext $clinicContext) {}

    private ?Clinic $clinic = null;

    public function forClinic(Clinic $clinic): self
    {
        $clone = clone $this;
        $clone->clinic = $clinic;

        return $clone;
    }

    public function configured(): bool
    {
        return filled($this->clientId())
            && filled($this->clientSecret())
            && filled($this->refreshToken());
    }

    public function calendarId(): string
    {
        $id = trim((string) ($this->resolveClinic()?->google_calendar_id ?? ''));

        return $id !== '' ? $id : 'primary';
    }

    public function timezone(): string
    {
        $clinic = $this->resolveClinic();

        return (string) ($clinic?->google_calendar_timezone
            ?: config('services.google_calendar.timezone', config('app.timezone')));
    }

    public function slotMinutes(): int
    {
        $clinic = $this->resolveClinic();
        $value = $clinic?->google_calendar_slot_minutes
            ?? config('services.google_calendar.slot_minutes', 60);

        return max(5, (int) $value);
    }

    public function businessHoursStart(): int
    {
        $clinic = $this->resolveClinic();
        $value = $clinic?->google_calendar_business_start
            ?? config('services.google_calendar.business_hours_start', 9);

        return (int) $value;
    }

    public function businessHoursEnd(): int
    {
        $clinic = $this->resolveClinic();
        $value = $clinic?->google_calendar_business_end
            ?? config('services.google_calendar.business_hours_end', 18);

        return (int) $value;
    }

    /**
     * @param  array{summary: string, description?: string|null, location?: string|null, start: string, end: string, allDay?: bool}  $payload
     * @return array{id: string, summary: string, description: string, htmlLink: string|null, start: string|null, end: string|null}
     */
    public function createEvent(array $payload): array
    {
        if (! $this->configured()) {
            throw new RuntimeException('Google Calendar não configurado. Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e o refresh token da clínica.');
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

        if ($response->failed() && ! in_array($response->status(), [404, 410], true)) {
            $detail = $response->json('error.message')
                ?? $response->json('error_description')
                ?? mb_substr($response->body(), 0, 300);
            throw new RuntimeException('Google Calendar erro ao excluir ('.$response->status().'): '.$detail);
        }
    }

    /**
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
                'timeZone' => $this->timezone(),
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

    private function resolveClinic(): ?Clinic
    {
        return $this->clinic ?? $this->clinicContext->clinic();
    }

    private function clientId(): ?string
    {
        $value = config('services.google_calendar.client_id');

        return filled($value) ? (string) $value : null;
    }

    private function clientSecret(): ?string
    {
        $value = config('services.google_calendar.client_secret');

        return filled($value) ? (string) $value : null;
    }

    /**
     * Sem fallback para o .env: o token define em qual agenda o evento é criado,
     * então clínica sem token própria conta como não configurada — caso contrário
     * ela gravaria na agenda da clínica que estiver no .env.
     */
    private function refreshToken(): ?string
    {
        $token = $this->resolveClinic()?->google_calendar_refresh_token;

        return filled($token) ? (string) $token : null;
    }

    private function accessToken(): string
    {
        $response = Http::asForm()->timeout(30)->post(self::TOKEN_URL, [
            'grant_type' => 'refresh_token',
            'client_id' => $this->clientId(),
            'client_secret' => $this->clientSecret(),
            'refresh_token' => $this->refreshToken(),
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
