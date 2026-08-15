<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;
use App\Support\ClinicContext;

class UpsertClinicConnection
{
    public function __construct(private ClinicContext $clinicContext) {}

    /**
     * Garante a conexão única da clínica ativa; atualiza atributos quando informados.
     *
     * @param  array{name?: string|null, default_lead_stage_id?: int|null}  $attrs
     */
    public function handle(array $attrs = [], ?int $userId = null): Connection
    {
        $clinic = $this->clinicContext->requireClinic();

        $connection = Connection::query()->first();

        if (! $connection) {
            $connection = Connection::create([
                'clinic_id' => $clinic->id,
                'name' => $attrs['name'] ?? 'WhatsApp principal',
                'status' => 'disconnected',
                'is_business' => false,
                'default_lead_stage_id' => $attrs['default_lead_stage_id'] ?? null,
                'created_by' => $userId,
            ]);
        } elseif ($attrs !== []) {
            $connection->fill(array_intersect_key($attrs, array_flip([
                'name',
                'default_lead_stage_id',
            ])))->save();
        }

        return $connection->fresh();
    }
}
