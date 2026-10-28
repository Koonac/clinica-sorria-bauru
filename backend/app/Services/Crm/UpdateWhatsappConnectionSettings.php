<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;

class UpdateWhatsappConnectionSettings
{
    public function __construct(private UpsertClinicConnection $upsert) {}

    /**
     * @param  array{default_lead_stage_id?: int|null, name?: string|null, ai_display_name?: string|null, whatsapp_agent_auto_resume_hours?: int, whatsapp_attendance_auto_close_minutes?: int, whatsapp_finalize_notice?: string|null, whatsapp_agent_history_limit?: int}  $attrs
     */
    public function handle(array $attrs, ?int $userId = null): Connection
    {
        $connection = $this->upsert->handle([], $userId);

        if (array_key_exists('default_lead_stage_id', $attrs)) {
            $connection->default_lead_stage_id = $attrs['default_lead_stage_id'];
        }
        if (array_key_exists('name', $attrs)) {
            $connection->name = $attrs['name'];
        }
        if (array_key_exists('ai_display_name', $attrs)) {
            $connection->ai_display_name = $attrs['ai_display_name'];
        }
        if (array_key_exists('whatsapp_agent_auto_resume_hours', $attrs)) {
            $connection->whatsapp_agent_auto_resume_hours = (int) $attrs['whatsapp_agent_auto_resume_hours'];
        }
        if (array_key_exists('whatsapp_attendance_auto_close_minutes', $attrs)) {
            $connection->whatsapp_attendance_auto_close_minutes = (int) $attrs['whatsapp_attendance_auto_close_minutes'];
        }
        if (array_key_exists('whatsapp_finalize_notice', $attrs)) {
            $notice = $attrs['whatsapp_finalize_notice'];
            $connection->whatsapp_finalize_notice = is_string($notice) ? trim($notice) : '';
        }
        if (array_key_exists('whatsapp_agent_history_limit', $attrs)) {
            $connection->whatsapp_agent_history_limit = max(5, min(100, (int) $attrs['whatsapp_agent_history_limit']));
        }
        if (array_key_exists('agent_test_phone', $attrs)) {
            $digits = preg_replace('/\D+/', '', (string) ($attrs['agent_test_phone'] ?? '')) ?: '';
            if ($digits !== '' && strlen($digits) <= 11) {
                $digits = '55'.$digits;
            }
            $connection->agent_test_phone = $digits !== '' ? $digits : null;
        }
        if (array_key_exists('reception_alert_jid', $attrs)) {
            $connection->reception_alert_jid = $this->normalizeAlertJid($attrs['reception_alert_jid']);
        }

        foreach ([
            'scheduling_mode',
            'appointment_reminder_enabled',
            'appointment_reminder_hours',
            'whatsapp_follow_up_enabled',
            'whatsapp_send_window_start',
            'whatsapp_send_window_end',
        ] as $key) {
            if (array_key_exists($key, $attrs)) {
                $connection->{$key} = $attrs[$key];
            }
        }
        if (array_key_exists('appointment_reminder_template', $attrs)) {
            $template = trim((string) ($attrs['appointment_reminder_template'] ?? ''));
            $connection->appointment_reminder_template = $template !== '' ? $template : null;
        }
        if (array_key_exists('whatsapp_follow_up_delays', $attrs)) {
            $connection->whatsapp_follow_up_delays = array_values(array_map('intval', (array) $attrs['whatsapp_follow_up_delays']));
        }

        $connection->save();

        return $connection->fresh();
    }

    /**
     * Aceita número (com ou sem +55/máscara) ou JID completo (grupo …@g.us).
     */
    private function normalizeAlertJid(mixed $value): ?string
    {
        $value = trim((string) ($value ?? ''));
        if ($value === '') {
            return null;
        }
        if (str_contains($value, '@')) {
            return $value;
        }

        $digits = preg_replace('/\D+/', '', $value) ?: '';
        if ($digits === '') {
            return null;
        }
        // Número nacional (DDD + número) ganha o DDI do Brasil.
        if (strlen($digits) <= 11) {
            $digits = '55'.$digits;
        }

        return $digits.'@c.us';
    }
}
