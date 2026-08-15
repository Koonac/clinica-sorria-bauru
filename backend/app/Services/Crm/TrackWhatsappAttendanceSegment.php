<?php

namespace App\Services\Crm;

use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappAttendanceSegment;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class TrackWhatsappAttendanceSegment
{
    /**
     * Fecha o segmento aberto do lead (se diferente) e abre um novo.
     * No-op se já existir segmento aberto com o mesmo mode + user_id.
     */
    public function handle(Lead $lead, string $mode, ?int $userId, string $source): ?WhatsappAttendanceSegment
    {
        if (! in_array($mode, WhatsappAttendanceSegment::MODES, true)) {
            throw new InvalidArgumentException("Invalid attendance mode: {$mode}");
        }

        if ($mode === WhatsappAttendanceSegment::MODE_AI) {
            $userId = null;
        }

        return DB::transaction(function () use ($lead, $mode, $userId, $source) {
            $open = WhatsappAttendanceSegment::query()
                ->where('lead_id', $lead->id)
                ->whereNull('ended_at')
                ->lockForUpdate()
                ->latest('id')
                ->first();

            if (
                $open
                && $open->mode === $mode
                && (int) ($open->user_id ?? 0) === (int) ($userId ?? 0)
            ) {
                return $open;
            }

            $now = now();

            if ($open) {
                $open->forceFill([
                    'ended_at' => $now,
                    'duration_seconds' => max(0, (int) $open->started_at->diffInSeconds($now)),
                ])->save();
            }

            return WhatsappAttendanceSegment::create([
                'clinic_id' => $lead->clinic_id,
                'lead_id' => $lead->id,
                'mode' => $mode,
                'user_id' => $userId,
                'started_at' => $now,
                'ended_at' => null,
                'duration_seconds' => null,
                'source' => $source,
            ]);
        });
    }
}
