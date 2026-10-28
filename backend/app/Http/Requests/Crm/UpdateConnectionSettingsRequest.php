<?php

namespace App\Http\Requests\Crm;

use App\Models\Crm\Connection;
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
            'whatsapp_finalize_notice' => ['sometimes', 'nullable', 'string', 'max:500'],
            'whatsapp_agent_history_limit' => ['sometimes', 'integer', 'min:5', 'max:100'],
            'reception_alert_jid' => ['sometimes', 'nullable', 'string', 'max:120', 'regex:/^(\+?[\d\s().-]{8,20}|[\w.-]+@(c\.us|g\.us|s\.whatsapp\.net))$/'],
            'scheduling_mode' => ['sometimes', Rule::in(Connection::SCHEDULING_MODES)],
            'appointment_reminder_enabled' => ['sometimes', 'boolean'],
            'appointment_reminder_hours' => ['sometimes', 'integer', 'min:2', 'max:72'],
            'appointment_reminder_template' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'whatsapp_follow_up_enabled' => ['sometimes', 'boolean'],
            'whatsapp_follow_up_delays' => ['sometimes', 'array', 'min:1', 'max:5'],
            'whatsapp_follow_up_delays.*' => ['integer', 'min:1', 'max:43200'],
            'whatsapp_send_window_start' => ['sometimes', 'integer', 'min:0', 'max:23'],
            'whatsapp_send_window_end' => ['sometimes', 'integer', 'min:1', 'max:24'],
            'agent_test_phone' => ['sometimes', 'nullable', 'string', 'max:30', 'regex:/^\+?[\d\s().-]{10,25}$/'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'reception_alert_jid.regex' => 'Informe um número de WhatsApp (com DDD) ou o id de um grupo (…@g.us).',
            'agent_test_phone.regex' => 'Informe o número de teste com DDD, ex.: (14) 99999-0000.',
        ];
    }
}
