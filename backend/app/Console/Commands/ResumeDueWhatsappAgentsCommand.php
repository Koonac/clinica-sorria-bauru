<?php

namespace App\Console\Commands;

use App\Models\Clinic;
use App\Models\Crm\Lead;
use App\Services\Crm\ResumeWhatsappAgentForLead;
use App\Support\ClinicContext;
use Illuminate\Console\Command;

class ResumeDueWhatsappAgentsCommand extends Command
{
    protected $signature = 'crm:resume-whatsapp-agents';

    protected $description = 'Retoma agents WhatsApp cujo prazo whatsapp_agent_resume_at já venceu';

    public function handle(ResumeWhatsappAgentForLead $resumer, ClinicContext $clinicContext): int
    {
        $leads = Lead::withoutGlobalScopes()
            ->whereNotNull('whatsapp_agent_paused_at')
            ->whereNotNull('whatsapp_agent_resume_at')
            ->where('whatsapp_agent_resume_at', '<=', now())
            ->get();

        $count = 0;
        foreach ($leads as $lead) {
            $clinic = $lead->clinic_id
                ? Clinic::query()->find($lead->clinic_id)
                : null;

            if ($clinic) {
                $clinicContext->set($clinic);
            }

            $resumer->handle($lead, 'auto_resume');
            $count++;
        }

        $clinicContext->clear();

        if ($count > 0) {
            $this->info("Retomados {$count} lead(s).");
        }

        return self::SUCCESS;
    }
}
