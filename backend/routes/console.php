<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('crm:resume-whatsapp-agents')->everyMinute();
Schedule::command('crm:auto-close-whatsapp-conversations')->everyMinute();
Schedule::command('crm:prune-whatsapp-media')->dailyAt('03:15');
Schedule::command('crm:send-whatsapp-follow-ups')->everyMinute()->withoutOverlapping();
Schedule::command('crm:send-appointment-reminders')->everyFiveMinutes()->withoutOverlapping();
