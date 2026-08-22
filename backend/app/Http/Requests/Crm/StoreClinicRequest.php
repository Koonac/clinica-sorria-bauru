<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;

class StoreClinicRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isDeveloper() === true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:190'],
            'slug' => ['nullable', 'string', 'max:190', 'alpha_dash:ascii'],
            'is_active' => ['sometimes', 'boolean'],
            'google_calendar_refresh_token' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'google_calendar_id' => ['sometimes', 'nullable', 'string', 'max:190'],
            'google_calendar_timezone' => ['sometimes', 'nullable', 'string', 'max:64'],
            'google_calendar_business_start' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:23'],
            'google_calendar_business_end' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:24'],
            'google_calendar_slot_minutes' => ['sometimes', 'nullable', 'integer', 'min:5', 'max:240'],
        ];
    }
}
