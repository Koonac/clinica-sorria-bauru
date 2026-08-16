<?php

namespace App\Http\Requests\Dev;

use App\Models\SystemSetting;
use Illuminate\Foundation\Http\FormRequest;

class UpdateSystemSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isDeveloper() === true;
    }

    public function rules(): array
    {
        return [
            SystemSetting::KEY_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT => [
                'sometimes',
                'required',
                'string',
                'min:20',
                'max:20000',
            ],
            SystemSetting::KEY_OPENROUTER_TRANSCRIPTION_MODEL => [
                'sometimes',
                'required',
                'string',
                'max:120',
                'regex:/^[A-Za-z0-9._\/:-]+$/',
            ],
            SystemSetting::KEY_OPENROUTER_TRANSCRIPTION_LANGUAGE => [
                'sometimes',
                'required',
                'string',
                'regex:/^[a-z]{2}$/',
            ],
            SystemSetting::KEY_OPENROUTER_VISION_MODEL => [
                'sometimes',
                'required',
                'string',
                'max:120',
                'regex:/^[A-Za-z0-9._\/:-]+$/',
            ],
        ];
    }

    public function messages(): array
    {
        return [
            SystemSetting::KEY_OPENROUTER_TRANSCRIPTION_MODEL.'.regex' => 'Informe um modelo válido (ex.: openai/whisper-1).',
            SystemSetting::KEY_OPENROUTER_VISION_MODEL.'.regex' => 'Informe um modelo válido (ex.: openai/gpt-4o-mini).',
            SystemSetting::KEY_OPENROUTER_TRANSCRIPTION_LANGUAGE.'.regex' => 'Informe o código ISO-639-1 com 2 letras minúsculas (ex.: pt).',
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $keys = array_keys($this->all());
            foreach ($keys as $key) {
                if (! in_array($key, SystemSetting::EDITABLE_KEYS, true)) {
                    $validator->errors()->add($key, 'Setting não permitida.');
                }
            }

            if ($keys === []) {
                $validator->errors()->add(
                    SystemSetting::KEY_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT,
                    'Informe ao menos uma configuração.',
                );
            }
        });
    }
}
