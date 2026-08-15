<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;

class UpdateWhatsappConnectionSettings
{
    public function __construct(private UpsertClinicConnection $upsert) {}

    /**
     * @param  array{default_lead_stage_id?: int|null, name?: string|null}  $attrs
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

        $connection->save();

        return $connection->fresh();
    }
}
