<?php

namespace App\Http\Requests\Crm\Concerns;

trait ValidatesAgentQualificationFields
{
    /**
     * @return array<string, mixed>
     */
    protected function qualificationFieldsRules(): array
    {
        return [
            'qualification_fields' => [
                'sometimes',
                'nullable',
                'array',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (! is_array($value)) {
                        return;
                    }

                    $keys = [];
                    foreach ($value as $field) {
                        if (! is_array($field)) {
                            continue;
                        }
                        $key = (string) ($field['key'] ?? '');
                        if ($key === '') {
                            continue;
                        }
                        if (isset($keys[$key])) {
                            $fail('As chaves dos campos de qualificação devem ser únicas.');

                            return;
                        }
                        $keys[$key] = true;
                    }
                },
            ],
            'qualification_fields.*.key' => [
                'required',
                'string',
                'max:40',
                'regex:/^[a-z][a-z0-9_]{1,39}$/',
            ],
            'qualification_fields.*.label' => ['required', 'string', 'max:80'],
            'qualification_fields.*.instruction' => ['required', 'string', 'max:500'],
        ];
    }
}
