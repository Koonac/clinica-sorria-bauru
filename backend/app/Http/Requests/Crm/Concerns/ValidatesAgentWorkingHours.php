<?php

namespace App\Http\Requests\Crm\Concerns;

trait ValidatesAgentWorkingHours
{
    /**
     * @return array<string, list<string>>
     */
    protected function workingHoursRules(): array
    {
        return [
            'working_hours' => ['sometimes', 'nullable', 'array', 'min:1'],
            'working_hours.*.start' => ['required', 'date_format:H:i'],
            'working_hours.*.end' => ['required', 'date_format:H:i'],
        ];
    }

    public function after(): array
    {
        return [
            function ($validator) {
                $hours = $this->input('working_hours');
                if (! is_array($hours)) {
                    return;
                }

                foreach ($hours as $day => $range) {
                    if (! in_array((string) $day, ['1', '2', '3', '4', '5', '6', '7'], true)) {
                        $validator->errors()->add('working_hours', 'Dia da semana inválido.');

                        continue;
                    }
                    // Fim antes do início é válido (vira a madrugada); igual não define período.
                    if (is_array($range) && ($range['start'] ?? null) === ($range['end'] ?? null)) {
                        $validator->errors()->add("working_hours.{$day}.end", 'O início e o fim devem ser diferentes.');
                    }
                }
            },
        ];
    }
}
