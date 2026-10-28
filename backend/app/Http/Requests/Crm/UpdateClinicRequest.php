<?php

namespace App\Http\Requests\Crm;

use App\Models\Clinic;
use Illuminate\Foundation\Http\FormRequest;

class UpdateClinicRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user?->isAdmin()) {
            return false;
        }

        if ($user->isDeveloper()) {
            return true;
        }

        /** @var Clinic $clinic */
        $clinic = $this->route('clinic');

        return $user->clinic_id !== null
            && (int) $user->clinic_id === (int) $clinic->id;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:190'],
            'slug' => ['sometimes', 'nullable', 'string', 'max:190', 'alpha_dash:ascii'],
            'is_active' => ['sometimes', 'boolean'],
            'google_calendar_refresh_token' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'google_calendar_id' => ['sometimes', 'nullable', 'string', 'max:190'],
            'google_calendar_timezone' => ['sometimes', 'nullable', 'string', 'max:64'],
            'google_calendar_business_start' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:23'],
            'google_calendar_business_end' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:24'],
            'google_calendar_slot_minutes' => ['sometimes', 'nullable', 'integer', 'min:5', 'max:240'],
            'business_hours' => ['sometimes', 'nullable', 'array'],
            'business_hours.*.start' => ['required', 'date_format:H:i'],
            'business_hours.*.end' => ['required', 'date_format:H:i'],
        ];
    }

    public function after(): array
    {
        return [
            function ($validator) {
                $hours = $this->input('business_hours');
                if (! is_array($hours)) {
                    return;
                }
                foreach ($hours as $day => $range) {
                    if (! in_array((int) $day, [1, 2, 3, 4, 5, 6, 7], true) || (string) (int) $day !== (string) $day) {
                        $validator->errors()->add('business_hours', 'Dia da semana inválido.');

                        continue;
                    }
                    $start = $range['start'] ?? null;
                    $end = $range['end'] ?? null;
                    if (is_string($start) && is_string($end) && $end <= $start) {
                        $label = Clinic::WEEKDAYS[(int) $day]['long'];
                        $validator->errors()->add("business_hours.{$day}.end", "Na {$label}, o fim deve ser depois do início.");
                    }
                }
            },
        ];
    }
}
