<?php

namespace App\Services\Crm;

use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappAttendanceSegment;
use Illuminate\Support\Facades\DB;

class CloseWhatsappAttendanceSegment
{
    /**
     * Fecha o segmento aberto do lead (se houver), sem abrir outro.
     */
    public function handle(Lead $lead): ?WhatsappAttendanceSegment
    {
        return DB::transaction(function () use ($lead) {
            $open = WhatsappAttendanceSegment::query()
                ->where('lead_id', $lead->id)
                ->whereNull('ended_at')
                ->lockForUpdate()
                ->latest('id')
                ->first();

            if (! $open) {
                return null;
            }

            $now = now();
            $attrs = [
                'ended_at' => $now,
                'duration_seconds' => max(0, (int) $open->started_at->diffInSeconds($now)),
            ];

            if ($open->mode === WhatsappAttendanceSegment::MODE_AI && $open->active_started_at !== null) {
                $elapsed = max(0, (int) $open->active_started_at->diffInSeconds($now));
                $attrs['active_seconds'] = (int) ($open->active_seconds ?? 0) + $elapsed;
                $attrs['active_started_at'] = null;
            }

            $open->forceFill($attrs)->save();

            return $open->fresh();
        });
    }
}
