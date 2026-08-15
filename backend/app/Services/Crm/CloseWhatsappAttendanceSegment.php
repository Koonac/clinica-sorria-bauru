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
            $open->forceFill([
                'ended_at' => $now,
                'duration_seconds' => max(0, (int) $open->started_at->diffInSeconds($now)),
            ])->save();

            return $open->fresh();
        });
    }
}
