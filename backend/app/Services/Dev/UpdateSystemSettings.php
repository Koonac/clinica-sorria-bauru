<?php

namespace App\Services\Dev;

use App\Models\SystemSetting;
use InvalidArgumentException;

class UpdateSystemSettings
{
    /**
     * @param  array<string, mixed>  $attrs
     * @return array<string, string|null>
     */
    public function handle(array $attrs): array
    {
        foreach ($attrs as $key => $value) {
            if (! in_array($key, SystemSetting::EDITABLE_KEYS, true)) {
                throw new InvalidArgumentException("Setting não editável: {$key}");
            }

            $stringValue = is_string($value) ? $value : (string) $value;

            SystemSetting::query()->updateOrCreate(
                ['key' => $key],
                ['value' => $stringValue],
            );
        }

        return app(GetSystemSettings::class)->handle();
    }
}
