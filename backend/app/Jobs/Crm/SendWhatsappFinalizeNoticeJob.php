<?php

namespace App\Jobs\Crm;

use App\Models\Clinic;
use App\Models\Crm\Lead;
use App\Models\User;
use App\Services\Crm\SendWhatsappFinalizeNotice;
use App\Support\ClinicContext;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SendWhatsappFinalizeNoticeJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public function __construct(
        public int $leadId,
        public ?int $userId = null,
    ) {}

    public function handle(SendWhatsappFinalizeNotice $sender, ClinicContext $clinicContext): void
    {
        $lead = Lead::withoutGlobalScopes()->find($this->leadId);
        if (! $lead) {
            return;
        }

        $clinic = Clinic::query()->find($lead->clinic_id);
        if ($clinic) {
            $clinicContext->set($clinic);
        }

        $user = $this->userId ? User::query()->find($this->userId) : null;
        $sender->handle($lead, $user);
    }
}
