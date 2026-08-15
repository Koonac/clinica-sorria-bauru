<?php

namespace App\Services\Crm;

use App\Models\Clinic;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class UpdateClinic
{
    /**
     * @param  array{
     *   name?: string,
     *   slug?: string|null,
     *   is_active?: bool,
     *   google_calendar_refresh_token?: string|null,
     *   google_calendar_id?: string|null,
     *   google_calendar_timezone?: string|null,
     *   google_calendar_business_start?: int|null,
     *   google_calendar_business_end?: int|null,
     *   google_calendar_slot_minutes?: int|null,
     * }  $attrs
     */
    public function handle(Clinic $clinic, array $attrs): Clinic
    {
        if (isset($attrs['name'])) {
            $name = trim((string) $attrs['name']);
            if ($name === '') {
                throw ValidationException::withMessages([
                    'name' => 'O nome da clínica é obrigatório.',
                ]);
            }
            $clinic->name = $name;
        }

        if (array_key_exists('slug', $attrs)) {
            $slug = trim((string) ($attrs['slug'] ?? ''));
            if ($slug === '') {
                $slug = Str::slug((string) $clinic->name);
            }
            if (
                Clinic::query()
                    ->where('slug', $slug)
                    ->whereKeyNot($clinic->id)
                    ->exists()
            ) {
                throw ValidationException::withMessages([
                    'slug' => 'Este slug já está em uso.',
                ]);
            }
            $clinic->slug = $slug;
        }

        if (array_key_exists('is_active', $attrs)) {
            $clinic->is_active = (bool) $attrs['is_active'];
        }

        foreach ([
            'google_calendar_refresh_token',
            'google_calendar_id',
            'google_calendar_timezone',
            'google_calendar_business_start',
            'google_calendar_business_end',
            'google_calendar_slot_minutes',
        ] as $field) {
            if (array_key_exists($field, $attrs)) {
                $clinic->{$field} = $attrs[$field];
            }
        }

        $clinic->save();

        return $clinic->fresh();
    }
}
