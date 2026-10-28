<?php

namespace App\Models;

use App\Models\Crm\Connection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Clinic extends Model
{
    protected $fillable = [
        'name',
        'slug',
        'is_active',
        'google_calendar_refresh_token',
        'google_calendar_id',
        'google_calendar_timezone',
        'google_calendar_business_start',
        'google_calendar_business_end',
        'google_calendar_slot_minutes',
        'business_hours',
    ];

    /** Dias ISO (1 = segunda … 7 = domingo) com rótulo curto e completo em PT. */
    public const WEEKDAYS = [
        1 => ['short' => 'seg', 'long' => 'segunda-feira'],
        2 => ['short' => 'ter', 'long' => 'terça-feira'],
        3 => ['short' => 'qua', 'long' => 'quarta-feira'],
        4 => ['short' => 'qui', 'long' => 'quinta-feira'],
        5 => ['short' => 'sex', 'long' => 'sexta-feira'],
        6 => ['short' => 'sáb', 'long' => 'sábado'],
        7 => ['short' => 'dom', 'long' => 'domingo'],
    ];

    protected $hidden = [
        'google_calendar_refresh_token',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'google_calendar_refresh_token' => 'encrypted',
            'google_calendar_business_start' => 'integer',
            'google_calendar_business_end' => 'integer',
            'google_calendar_slot_minutes' => 'integer',
            'business_hours' => 'array',
        ];
    }

    /**
     * Horário de atendimento por dia ISO (só dias abertos). Sem configuração, cai no padrão
     * antigo: segunda a sexta, das google_calendar_business_start às _end (ou config).
     *
     * @return array<int, array{start: string, end: string}>
     */
    public function resolvedBusinessHours(): array
    {
        $configured = is_array($this->business_hours) ? $this->business_hours : null;

        if ($configured !== null) {
            $out = [];
            foreach (self::WEEKDAYS as $day => $_) {
                $slot = $configured[$day] ?? $configured[(string) $day] ?? null;
                if (is_array($slot) && self::isTime($slot['start'] ?? null) && self::isTime($slot['end'] ?? null)
                    && $slot['end'] > $slot['start']) {
                    $out[$day] = ['start' => $slot['start'], 'end' => $slot['end']];
                }
            }

            return $out;
        }

        $start = (int) ($this->google_calendar_business_start ?? config('services.google_calendar.business_hours_start', 9));
        $end = (int) ($this->google_calendar_business_end ?? config('services.google_calendar.business_hours_end', 18));
        if ($end <= $start) {
            [$start, $end] = [9, 18];
        }

        $range = [
            'start' => sprintf('%02d:00', $start),
            'end' => $end >= 24 ? '23:59' : sprintf('%02d:00', $end),
        ];

        return array_fill_keys([1, 2, 3, 4, 5], $range);
    }

    /**
     * Ex.: "seg a sex 08:00–18:00; sáb 08:00–12:00; fechado: dom".
     */
    public function businessHoursSummary(): string
    {
        $hours = $this->resolvedBusinessHours();
        if ($hours === []) {
            return 'nenhum dia de atendimento configurado';
        }

        $parts = [];
        $closed = [];
        foreach (self::WEEKDAYS as $day => $label) {
            if (! isset($hours[$day])) {
                $closed[] = $label['short'];

                continue;
            }
            $range = $hours[$day]['start'].'–'.$hours[$day]['end'];
            $last = array_key_last($parts);
            // Agrupa dias seguidos com o mesmo horário ("seg a sex").
            if ($last !== null && $parts[$last]['range'] === $range && $parts[$last]['to'] === $day - 1) {
                $parts[$last]['to'] = $day;
            } else {
                $parts[] = ['from' => $day, 'to' => $day, 'range' => $range];
            }
        }

        $text = implode('; ', array_map(function (array $p) {
            $days = self::WEEKDAYS[$p['from']]['short'];
            if ($p['to'] !== $p['from']) {
                $days .= ($p['to'] - $p['from'] === 1 ? ' e ' : ' a ').self::WEEKDAYS[$p['to']]['short'];
            }

            return "{$days} {$p['range']}";
        }, $parts));

        return $closed !== [] ? $text.'; fechado: '.implode(', ', $closed) : $text;
    }

    private static function isTime(mixed $value): bool
    {
        return is_string($value) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value) === 1;
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function connection(): HasOne
    {
        return $this->hasOne(Connection::class);
    }

    /**
     * @return array<string, mixed>
     */
    public function toPublicArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'is_active' => (bool) $this->is_active,
            'business_hours' => (object) $this->resolvedBusinessHours(),
            'appointment_slot_minutes' => max(5, (int) ($this->google_calendar_slot_minutes
                ?? config('services.google_calendar.slot_minutes', 60))),
        ];
    }
}
