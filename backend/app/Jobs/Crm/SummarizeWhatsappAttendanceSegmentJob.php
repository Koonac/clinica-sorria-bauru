<?php

namespace App\Jobs\Crm;

use App\Models\Clinic;
use App\Models\Crm\WhatsappAttendanceSegment;
use App\Services\Crm\SummarizeWhatsappAttendanceSegment;
use App\Support\ClinicContext;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SummarizeWhatsappAttendanceSegmentJob implements ShouldQueue, ShouldBeUniqueUntilProcessing
{
    use Queueable;

    public int $uniqueFor = 300;

    public int $tries = 3;

    public function __construct(public int $segmentId) {}

    public function uniqueId(): string
    {
        return 'wa-segment-summary:'.$this->segmentId;
    }

    public function handle(SummarizeWhatsappAttendanceSegment $summarizer, ClinicContext $clinicContext): void
    {
        $segment = WhatsappAttendanceSegment::withoutGlobalScopes()->find($this->segmentId);
        if (! $segment) {
            return;
        }

        $clinic = Clinic::query()->find($segment->clinic_id);
        if ($clinic) {
            $clinicContext->set($clinic);
        }

        $summarizer->handle($segment);
    }
}
