<?php

namespace App\Console\Commands;

use App\Jobs\Crm\SendAppointmentReminderJob;
use App\Models\Crm\Appointment;
use App\Models\Crm\Connection;
use Illuminate\Console\Command;

class SendAppointmentRemindersCommand extends Command
{
    protected $signature = 'crm:send-appointment-reminders';

    protected $description = 'Envia lembrete (com pedido de confirmação) para consultas que começam nas próximas horas';

    /** Consultas muito em cima da hora não recebem lembrete. */
    private const MIN_LEAD_HOURS = 2;

    public function handle(): int
    {
        $connections = Connection::withoutGlobalScopes()
            ->where('status', 'connected')
            ->where('appointment_reminder_enabled', true)
            ->get();

        $count = 0;
        foreach ($connections as $connection) {
            if (! $connection->isWithinSendWindow()) {
                continue;
            }

            $ids = Appointment::withoutGlobalScopes()
                ->where('clinic_id', $connection->clinic_id)
                ->where('status', Appointment::STATUS_SCHEDULED)
                ->whereNull('reminder_sent_at')
                ->where('starts_at', '>', now()->addHours(self::MIN_LEAD_HOURS))
                ->where('starts_at', '<=', now()->addHours($connection->resolvedReminderHours()))
                ->pluck('id');

            foreach ($ids as $id) {
                SendAppointmentReminderJob::dispatch((int) $id);
                $count++;
            }
        }

        if ($count > 0) {
            $this->info("Lembretes enfileirados: {$count}.");
        }

        return self::SUCCESS;
    }
}
