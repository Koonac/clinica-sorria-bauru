<?php

namespace App\Console\Commands;

use App\Jobs\Crm\SendWhatsappFollowUpJob;
use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use Illuminate\Console\Command;

class SendDueWhatsappFollowUpsCommand extends Command
{
    protected $signature = 'crm:send-whatsapp-follow-ups';

    protected $description = 'Envia follow-ups automáticos vencidos para leads que pararam de responder';

    public function handle(): int
    {
        $connections = Connection::withoutGlobalScopes()
            ->where('status', 'connected')
            ->where('whatsapp_follow_up_enabled', true)
            ->get();

        $count = 0;
        foreach ($connections as $connection) {
            $due = Lead::withoutGlobalScopes()
                ->where('clinic_id', $connection->clinic_id)
                ->whereNotNull('whatsapp_follow_up_due_at')
                ->where('whatsapp_follow_up_due_at', '<=', now())
                ->limit(200)
                ->get(['id', 'clinic_id', 'whatsapp_follow_up_due_at']);

            // Fora da janela (ex.: madrugada): adia para a próxima abertura em vez de enviar.
            if (! $connection->isWithinSendWindow()) {
                $opening = $connection->nextSendWindowOpening();
                Lead::withoutGlobalScopes()
                    ->whereIn('id', $due->pluck('id'))
                    ->update(['whatsapp_follow_up_due_at' => $opening]);

                continue;
            }

            foreach ($due as $lead) {
                SendWhatsappFollowUpJob::dispatch((int) $lead->id);
                $count++;
            }
        }

        if ($count > 0) {
            $this->info("Follow-ups enfileirados: {$count}.");
        }

        return self::SUCCESS;
    }
}
