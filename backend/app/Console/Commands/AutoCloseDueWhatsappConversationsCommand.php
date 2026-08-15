<?php

namespace App\Console\Commands;

use App\Models\Clinic;
use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappMessage;
use App\Services\Crm\FinalizeWhatsappConversationForLead;
use App\Support\ClinicContext;
use Illuminate\Console\Command;

class AutoCloseDueWhatsappConversationsCommand extends Command
{
    protected $signature = 'crm:auto-close-whatsapp-conversations';

    protected $description = 'Finaliza atendimentos WhatsApp cujo prazo whatsapp_auto_close_at já venceu';

    public function handle(FinalizeWhatsappConversationForLead $finalizer, ClinicContext $clinicContext): int
    {
        $dueIds = Lead::withoutGlobalScopes()
            ->whereNull('whatsapp_conversation_closed_at')
            ->whereNotNull('whatsapp_auto_close_at')
            ->where('whatsapp_auto_close_at', '<=', now())
            ->pluck('id');

        // Fallback: última msg outbound vencida e auto_close_at nunca gravado (ex.: worker antigo).
        $fallbackIds = $this->fallbackDueLeadIds();

        $ids = $dueIds->merge($fallbackIds)->unique()->values();

        $count = 0;
        foreach ($ids as $id) {
            $lead = Lead::withoutGlobalScopes()->find($id);
            if (! $lead || $lead->whatsapp_conversation_closed_at !== null) {
                continue;
            }

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

    /**
     * @return \Illuminate\Support\Collection<int, int>
     */
    private function fallbackDueLeadIds()
    {
        $connections = Connection::withoutGlobalScopes()
            ->get(['id', 'clinic_id', 'whatsapp_attendance_auto_close_minutes']);

        $ids = collect();

        foreach ($connections as $connection) {
            $minutes = max(1, min(1440, (int) ($connection->whatsapp_attendance_auto_close_minutes ?? 10)));
            $cutoff = now()->subMinutes($minutes);

            $leadIds = WhatsappMessage::withoutGlobalScopes()
                ->select('lead_id')
                ->where('connection_id', $connection->id)
                ->whereNotNull('lead_id')
                ->whereIn('lead_id', function ($q) use ($connection) {
                    $q->select('id')
                        ->from('leads')
                        ->where('clinic_id', $connection->clinic_id)
                        ->whereNull('whatsapp_conversation_closed_at')
                        ->whereNull('whatsapp_auto_close_at');
                })
                ->groupBy('lead_id')
                ->havingRaw('MAX(COALESCE(wa_timestamp, created_at)) <= ?', [$cutoff])
                ->havingRaw(
                    "MAX(CASE WHEN direction IN ('outbound', 'out') THEN COALESCE(wa_timestamp, created_at) END) = MAX(COALESCE(wa_timestamp, created_at))"
                )
                ->pluck('lead_id');

            $ids = $ids->merge($leadIds);
        }

        return $ids->unique()->values();
    }
}
