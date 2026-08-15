<?php

namespace App\Services\Crm;

use App\Models\Crm\WhatsappAttendanceSegment;
use Carbon\Carbon;

class GetAttendanceStats
{
    /**
     * @return array{
     *   dias: int,
     *   total_ai_seconds: int,
     *   total_human_seconds: int,
     *   avg_human_seconds: int|null,
     *   open_ai: int,
     *   open_human: int,
     *   by_user: list<array{user_id: int|null, name: string, total_seconds: int}>
     * }
     */
    public function handle(int $dias = 30): array
    {
        $dias = max(7, min(90, $dias));
        $tz = config('app.timezone') ?: 'UTC';
        $windowStart = Carbon::now($tz)->subDays($dias - 1)->startOfDay();
        $now = Carbon::now($tz);

        $segments = WhatsappAttendanceSegment::query()
            ->with('user:id,name')
            ->where(function ($q) use ($windowStart) {
                $q->whereNull('ended_at')
                    ->orWhere('ended_at', '>=', $windowStart);
            })
            ->where('started_at', '<=', $now)
            ->get();

        $totalAi = 0;
        $totalHuman = 0;
        $closedHumanSeconds = [];
        $byUser = [];

        foreach ($segments as $segment) {
            $seconds = $this->overlapSeconds($segment, $windowStart, $now);
            if ($seconds <= 0) {
                continue;
            }

            if ($segment->mode === WhatsappAttendanceSegment::MODE_AI) {
                $totalAi += $seconds;
            } else {
                $totalHuman += $seconds;
                if ($segment->ended_at !== null) {
                    $closedHumanSeconds[] = $seconds;
                }
                $key = $segment->user_id !== null ? (string) $segment->user_id : 'none';
                if (! isset($byUser[$key])) {
                    $byUser[$key] = [
                        'user_id' => $segment->user_id,
                        'name' => $segment->user?->name ?? 'Sem atendente',
                        'total_seconds' => 0,
                    ];
                }
                $byUser[$key]['total_seconds'] += $seconds;
            }
        }

        $byUserList = array_values($byUser);
        usort($byUserList, fn (array $a, array $b) => $b['total_seconds'] <=> $a['total_seconds']);

        $openAi = WhatsappAttendanceSegment::query()
            ->where('mode', WhatsappAttendanceSegment::MODE_AI)
            ->whereNull('ended_at')
            ->count();
        $openHuman = WhatsappAttendanceSegment::query()
            ->where('mode', WhatsappAttendanceSegment::MODE_HUMAN)
            ->whereNull('ended_at')
            ->count();

        $avgHuman = null;
        if (count($closedHumanSeconds) > 0) {
            $avgHuman = (int) round(array_sum($closedHumanSeconds) / count($closedHumanSeconds));
        }

        return [
            'dias' => $dias,
            'total_ai_seconds' => $totalAi,
            'total_human_seconds' => $totalHuman,
            'avg_human_seconds' => $avgHuman,
            'open_ai' => $openAi,
            'open_human' => $openHuman,
            'by_user' => $byUserList,
        ];
    }

    private function overlapSeconds(
        WhatsappAttendanceSegment $segment,
        Carbon $windowStart,
        Carbon $now,
    ): int {
        $start = $segment->started_at?->copy()->timezone($windowStart->timezoneName) ?? $windowStart;
        $end = $segment->ended_at?->copy()->timezone($windowStart->timezoneName) ?? $now;

        if ($start->lt($windowStart)) {
            $start = $windowStart->copy();
        }
        if ($end->gt($now)) {
            $end = $now->copy();
        }
        if ($end->lte($start)) {
            return 0;
        }

        return max(0, (int) $start->diffInSeconds($end));
    }
}
