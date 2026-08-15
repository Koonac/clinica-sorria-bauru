<?php

namespace Database\Seeders;

use App\Models\Clinic;
use Illuminate\Database\Seeder;

class ClinicSeeder extends Seeder
{
    public function run(): void
    {
        Clinic::query()->firstOrCreate(
            ['slug' => 'sorria-bauru'],
            [
                'name' => 'Clínica Sorria Bauru',
                'is_active' => true,
                'google_calendar_id' => config('services.google_calendar.calendar_id'),
                'google_calendar_timezone' => config('services.google_calendar.timezone'),
                'google_calendar_business_start' => config('services.google_calendar.business_hours_start'),
                'google_calendar_business_end' => config('services.google_calendar.business_hours_end'),
                'google_calendar_slot_minutes' => config('services.google_calendar.slot_minutes'),
                'google_calendar_refresh_token' => config('services.google_calendar.refresh_token') ?: null,
            ],
        );
    }
}
