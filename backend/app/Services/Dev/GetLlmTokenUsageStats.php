<?php

namespace App\Services\Dev;

use App\Models\LlmTokenUsage;
use Carbon\Carbon;

class GetLlmTokenUsageStats
{
    /**
     * @return array{
     *   dias: int,
     *   totals: array{prompt_tokens: int, completion_tokens: int, total_tokens: int, cost: float, calls: int},
     *   by_day: list<array{date: string, prompt_tokens: int, completion_tokens: int, total_tokens: int, cost: float, calls: int}>,
     *   by_purpose: list<array{purpose: string, prompt_tokens: int, completion_tokens: int, total_tokens: int, cost: float, calls: int}>,
     *   by_model: list<array{model: string, prompt_tokens: int, completion_tokens: int, total_tokens: int, cost: float, calls: int}>
     * }
     */
    public function handle(int $dias = 30): array
    {
        $dias = max(7, min(90, $dias));
        $tz = config('app.timezone') ?: 'UTC';
        $inicio = Carbon::now($tz)->subDays($dias - 1)->startOfDay();

        $rows = LlmTokenUsage::query()
            ->where('created_at', '>=', $inicio->copy()->utc())
            ->get(['purpose', 'model', 'prompt_tokens', 'completion_tokens', 'total_tokens', 'cost', 'created_at']);

        $totals = [
            'prompt_tokens' => 0,
            'completion_tokens' => 0,
            'total_tokens' => 0,
            'cost' => 0.0,
            'calls' => 0,
        ];
        $byDayMap = [];
        $byPurposeMap = [];
        $byModelMap = [];

        foreach ($rows as $row) {
            $prompt = (int) $row->prompt_tokens;
            $completion = (int) $row->completion_tokens;
            $total = (int) $row->total_tokens;
            $cost = (float) $row->cost;

            $totals['prompt_tokens'] += $prompt;
            $totals['completion_tokens'] += $completion;
            $totals['total_tokens'] += $total;
            $totals['cost'] += $cost;
            $totals['calls']++;

            $day = $row->created_at->timezone($tz)->toDateString();
            if (! isset($byDayMap[$day])) {
                $byDayMap[$day] = $this->emptyBucket(['date' => $day]);
            }
            $this->addToBucket($byDayMap[$day], $prompt, $completion, $total, $cost);

            $purpose = (string) ($row->purpose ?: 'other');
            if (! isset($byPurposeMap[$purpose])) {
                $byPurposeMap[$purpose] = $this->emptyBucket(['purpose' => $purpose]);
            }
            $this->addToBucket($byPurposeMap[$purpose], $prompt, $completion, $total, $cost);

            $model = trim((string) ($row->model ?: 'desconhecido'));
            if (! isset($byModelMap[$model])) {
                $byModelMap[$model] = $this->emptyBucket(['model' => $model]);
            }
            $this->addToBucket($byModelMap[$model], $prompt, $completion, $total, $cost);
        }

        $byDay = [];
        for ($i = 0; $i < $dias; $i++) {
            $day = $inicio->copy()->addDays($i)->toDateString();
            $byDay[] = $byDayMap[$day] ?? $this->emptyBucket(['date' => $day]);
        }

        $byPurpose = array_values($byPurposeMap);
        usort($byPurpose, fn (array $a, array $b): int => $b['total_tokens'] <=> $a['total_tokens']);

        $byModel = array_values($byModelMap);
        usort($byModel, fn (array $a, array $b): int => $b['total_tokens'] <=> $a['total_tokens']);

        $totals['cost'] = round($totals['cost'], 8);

        return [
            'dias' => $dias,
            'totals' => $totals,
            'by_day' => $byDay,
            'by_purpose' => $byPurpose,
            'by_model' => $byModel,
        ];
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private function emptyBucket(array $extra = []): array
    {
        return [
            ...$extra,
            'prompt_tokens' => 0,
            'completion_tokens' => 0,
            'total_tokens' => 0,
            'cost' => 0.0,
            'calls' => 0,
        ];
    }

    /**
     * @param  array<string, mixed>  $bucket
     */
    private function addToBucket(array &$bucket, int $prompt, int $completion, int $total, float $cost): void
    {
        $bucket['prompt_tokens'] += $prompt;
        $bucket['completion_tokens'] += $completion;
        $bucket['total_tokens'] += $total;
        $bucket['cost'] = round(((float) $bucket['cost']) + $cost, 8);
        $bucket['calls']++;
    }
}
