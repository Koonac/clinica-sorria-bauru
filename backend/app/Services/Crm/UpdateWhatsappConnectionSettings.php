<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;

class UpdateWhatsappConnectionSettings
{
    public function __construct(private UpsertClinicConnection $upsert) {}

    /**
     * @param  array{default_lead_stage_id?: int|null, name?: string|null, ai_display_name?: string|null, whatsapp_agent_auto_resume_hours?: int}  $attrs
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

        $connection->save();

        return $connection->fresh();
    }
}
