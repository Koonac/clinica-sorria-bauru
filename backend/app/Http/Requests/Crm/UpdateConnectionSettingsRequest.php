<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateConnectionSettingsRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'ai_display_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'default_lead_stage_id' => [
                'nullable',
                'integer',
                Rule::exists('pipeline_stages', 'id')->where(
                    fn ($q) => $q->where('kind', 'lead')->where('active', true)
                ),
            ],
            'whatsapp_agent_auto_resume_hours' => ['sometimes', 'integer', 'min:1', 'max:168'],
            'whatsapp_attendance_auto_close_minutes' => ['sometimes', 'integer', 'min:1', 'max:1440'],
        ];
    }
}
