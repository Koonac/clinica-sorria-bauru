<?php

namespace App\Services\Crm;

use App\Models\Crm\Activity;
use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use App\Models\Crm\PipelineStage;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MoveLead
{
    public function __construct(private SyncWhatsappLabels $labelSync) {}

    /**
     * Move um lead para um estágio do pipeline de leads.
     * Entrar em estágio perdido exige lost_reason.
     */
    public function handle(
        Lead $lead,
        int $stageId,
        ?int $userId = null,
        ?string $lostReason = null,
    ): Lead {
        $destino = PipelineStage::ofKind('lead')->findOrFail($stageId);

        $resultado = DB::transaction(function () use ($lead, $destino, $userId, $lostReason) {
            $origemId = $lead->stage_id;

            if ($lead->status === 'converted') {
                return [
                    'lead' => $lead->fresh(['stage', 'source', 'owner']),
                    'origem' => null,
                    'destino' => null,
                    'stage_mudou' => false,
                ];
            }

            $origem = $origemId ? PipelineStage::find($origemId) : null;
            $entrandoEmPerdido = $destino->is_lost && ! ($origem?->is_lost ?? false);

            $mudancas = ['stage_id' => $destino->id];

            if ($entrandoEmPerdido) {
                $motivo = trim((string) $lostReason);
                if ($motivo === '') {
                    throw ValidationException::withMessages([
                        'lost_reason' => 'Informe o motivo da perda ao mover para um estágio perdido.',
                    ]);
                }
                $mudancas['lost_reason'] = $motivo;
            }

            $stageMudou = (int) $origemId !== (int) $destino->id;
            $lead->update($mudancas);
            $lead->touch();

            if ($stageMudou || isset($mudancas['lost_reason'])) {
                Activity::create([
                    'type' => 'stage_change',
                    'subject' => "Lead movido para \"{$destino->name}\"",
                    'lead_id' => $lead->id,
                    'user_id' => $userId,
                    'meta' => [
                        'from_stage_id' => $origemId ? (int) $origemId : null,
                        'to_stage_id' => (int) $destino->id,
                        'to_status' => $destino->status(),
                        'lost_reason' => $lead->lost_reason,
                    ],
                ]);
            }

            return [
                'lead' => $lead->fresh(['stage', 'source', 'owner']),
                'origem' => $origem,
                'destino' => $destino,
                'stage_mudou' => $stageMudou,
            ];
        });

        if ($resultado['stage_mudou']) {
            $connection = $this->connectionForLead($resultado['lead']);
            if ($connection) {
                $this->labelSync->moveCardLabels(
                    $connection,
                    $resultado['lead']->whatsapp_jid,
                    $resultado['origem'],
                    $resultado['destino'],
                );
            }
        }

        return $resultado['lead'];
    }

    private function connectionForLead(Lead $lead): ?Connection
    {
        $clinicId = $lead->clinic_id;
        if (! $clinicId) {
            return null;
        }

        return Connection::withoutGlobalScopes()
            ->where('clinic_id', $clinicId)
            ->first();
    }
}
