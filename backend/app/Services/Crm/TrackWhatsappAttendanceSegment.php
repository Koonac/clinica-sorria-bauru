<?php

namespace App\Services\Crm;

use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappAttendanceSegment;
use Illuminate\Support\Carbon;
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
                $this->flushActiveTime($open, $now);
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
                'active_seconds' => 0,
                'active_started_at' => null,
                'source' => $source,
            ]);
        });
    }

    /**
     * Marca início do processamento ativo da IA (job em execução).
     */
    public function startActiveAiTime(Lead $lead): void
    {
        if ($lead->isWhatsappAgentPaused()) {
            return;
        }

        DB::transaction(function () use ($lead) {
            $segment = WhatsappAttendanceSegment::query()
                ->where('lead_id', $lead->id)
                ->where('mode', WhatsappAttendanceSegment::MODE_AI)
                ->whereNull('ended_at')
                ->lockForUpdate()
                ->latest('id')
                ->first();

            if (! $segment || $segment->active_started_at !== null) {
                return;
            }

            $segment->forceFill(['active_started_at' => now()])->save();
        });
    }

    /**
     * Acumula o tempo ativo da IA ao fim do job (segmento permanece aberto para a sessão).
     */
    public function stopActiveAiTime(Lead $lead): void
    {
        DB::transaction(function () use ($lead) {
            $segment = WhatsappAttendanceSegment::query()
                ->where('lead_id', $lead->id)
                ->where('mode', WhatsappAttendanceSegment::MODE_AI)
                ->whereNull('ended_at')
                ->lockForUpdate()
                ->latest('id')
                ->first();

            if (! $segment) {
                return;
            }

            $this->flushActiveTime($segment, now());
        });
    }

    private function flushActiveTime(WhatsappAttendanceSegment $segment, Carbon $now): void
    {
        if ($segment->active_started_at === null) {
            return;
        }

        $elapsed = max(0, (int) $segment->active_started_at->diffInSeconds($now));
        $segment->forceFill([
            'active_seconds' => (int) ($segment->active_seconds ?? 0) + $elapsed,
            'active_started_at' => null,
        ])->save();
    }
}
