<?php

namespace App\Services\Crm;

use App\Models\Crm\Agent;
use App\Models\Crm\Lead;

class StoreLeadQualificationData
{
    public function handle(Lead $lead, string $key, string $value, string $label): Lead
    {
        return $this->write($lead, $key, $value, $label);
    }

    /**
     * Aplica um mapa chave → valor (string) ou null para limpar.
     *
     * @param  array<string, string|null>  $map
     */
    public function applyMap(Lead $lead, array $map, ?Agent $agent = null): Lead
    {
        foreach ($map as $key => $value) {
            $key = (string) $key;
            if ($value === null || trim((string) $value) === '') {
                $lead = $this->clear($lead, $key);

                continue;
            }

            $label = $this->resolveLabel($lead, $key, $agent);
            $lead = $this->write($lead, $key, trim((string) $value), $label);
        }

        return $lead;
    }

    private function write(Lead $lead, string $key, string $value, string $label): Lead
    {
        $data = $this->current($lead);
        $data[$key] = [
            'label' => $label !== '' ? $label : $key,
            'value' => $value,
            'updated_at' => now()->toIso8601String(),
        ];

        $lead->forceFill(['qualification_data' => $data])->save();

        return $lead->fresh() ?? $lead;
    }

    private function clear(Lead $lead, string $key): Lead
    {
        $data = $this->current($lead);
        if (! array_key_exists($key, $data)) {
            return $lead;
        }

        unset($data[$key]);
        $lead->forceFill(['qualification_data' => $data === [] ? null : $data])->save();

        return $lead->fresh() ?? $lead;
    }

    /**
     * @return array<string, array{label: string, value: string, updated_at?: string}>
     */
    private function current(Lead $lead): array
    {
        $data = $lead->qualification_data;

        return is_array($data) ? $data : [];
    }

    private function resolveLabel(Lead $lead, string $key, ?Agent $agent): string
    {
        $existing = $this->current($lead)[$key]['label'] ?? null;
        if (is_string($existing) && trim($existing) !== '') {
            return trim($existing);
        }

        $field = $agent?->findQualificationField($key);
        if ($field !== null) {
            return $field['label'];
        }

        return $key;
    }
}
