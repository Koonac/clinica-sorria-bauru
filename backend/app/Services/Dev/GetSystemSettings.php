<?php

namespace App\Services\Dev;

use App\Models\SystemSetting;

class GetSystemSettings
{
    /**
     * @return array<string, string|null>
     */
    public function handle(): array
    {
        $rows = SystemSetting::query()
            ->whereIn('key', SystemSetting::EDITABLE_KEYS)
            ->pluck('value', 'key');

        $settings = [];
        foreach (SystemSetting::EDITABLE_KEYS as $key) {
            $value = $rows[$key] ?? null;
            if ($value === null || trim((string) $value) === '') {
                $value = SystemSetting::defaultValue($key);
            }
            $settings[$key] = $value;
        }

        return $settings;
    }
}
