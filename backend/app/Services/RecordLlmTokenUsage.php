<?php

namespace App\Services;

use App\Models\LlmTokenUsage;

class RecordLlmTokenUsage
{
    /**
     * @param  array<string, mixed>|null  $usage
     */
    public function handle(
        ?array $usage,
        string $purpose,
        string $model,
        ?int $clinicId = null,
        string $provider = 'openrouter',
    ): void {
        if (! is_array($usage)) {
            return;
        }

        $prompt = (int) ($usage['prompt_tokens'] ?? 0);
        $completion = (int) ($usage['completion_tokens'] ?? 0);
        $total = (int) ($usage['total_tokens'] ?? ($prompt + $completion));
        $cost = $this->parseCost($usage['cost'] ?? null);

        if ($prompt <= 0 && $completion <= 0 && $total <= 0 && $cost <= 0) {
            return;
        }

        LlmTokenUsage::query()->create([
            'clinic_id' => $clinicId,
            'provider' => $provider,
            'purpose' => $purpose,
            'model' => $model !== '' ? $model : null,
            'prompt_tokens' => max(0, $prompt),
            'completion_tokens' => max(0, $completion),
            'total_tokens' => max(0, $total),
            'cost' => $cost,
            'created_at' => now(),
        ]);
    }

    private function parseCost(mixed $value): float
    {
        if (! is_numeric($value)) {
            return 0.0;
        }

        return max(0.0, (float) $value);
    }
}
