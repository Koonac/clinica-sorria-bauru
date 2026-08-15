<?php

namespace App\Console\Commands;

use App\Models\Clinic;
use App\Models\Crm\Lead;
use App\Services\Crm\FinalizeWhatsappConversationForLead;
use App\Support\ClinicContext;
use Illuminate\Console\Command;

class AutoCloseDueWhatsappConversationsCommand extends Command
{
    protected $signature = 'crm:auto-close-whatsapp-conversations';

    protected $description = 'Finaliza atendimentos WhatsApp cujo prazo whatsapp_auto_close_at já venceu';

    public function handle(FinalizeWhatsappConversationForLead $finalizer, ClinicContext $clinicContext): int
    {
        $leads = Lead::withoutGlobalScopes()
            ->whereNull('whatsapp_conversation_closed_at')
            ->whereNotNull('whatsapp_auto_close_at')
            ->where('whatsapp_auto_close_at', '<=', now())
            ->get();

        $count = 0;
        foreach ($leads as $lead) {
            $clinic = $lead->clinic_id
                ? Clinic::query()->find($lead->clinic_id)
                : null;

            if ($clinic) {
                $clinicContext->set($clinic);
            }

            $finalizer->handle($lead, null, FinalizeWhatsappConversationForLead::SOURCE_AUTO_CLOSE);
            $count++;
        }

        $clinicContext->clear();

        if ($count > 0) {
            $this->info("Finalizados {$count} lead(s) por inatividade.");
        }

        return self::SUCCESS;
    }
}
