<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;
use App\Models\Crm\Lead;

/**
 * Agenda a sequência de follow-up para leads que pararam de responder à IA.
 * whatsapp_follow_up_step = quantos follow-ups já foram enviados;
 * whatsapp_follow_up_due_at = quando enviar o próximo (null = sequência inativa).
 */
class ScheduleWhatsappFollowUp
{
    /** IA respondeu o lead: (re)inicia a contagem a partir do primeiro atraso. */
    public function arm(Lead $lead, Connection $connection): Lead
    {
        if (! $connection->whatsapp_follow_up_enabled) {
            return $this->clear($lead);
        }

        $delays = $connection->resolvedFollowUpDelays();

        $lead->forceFill([
            'whatsapp_follow_up_step' => 0,
            'whatsapp_follow_up_due_at' => now()->addMinutes($delays[0]),
        ])->save();

        return $lead;
    }

    /**
     * Follow-up enviado: agenda o próximo ou encerra a sequência.
     *
     * @return bool true se ainda há tentativas pela frente
     */
    public function advance(Lead $lead, Connection $connection): bool
    {
        $delays = $connection->resolvedFollowUpDelays();
        $step = (int) $lead->whatsapp_follow_up_step + 1;
        $hasNext = $step < count($delays);

        $lead->forceFill([
            'whatsapp_follow_up_step' => $step,
            'whatsapp_follow_up_due_at' => $hasNext ? now()->addMinutes($delays[$step]) : null,
        ])->save();

        return $hasNext;
    }

    /** Lead respondeu, humano assumiu ou assunto resolvido: para a sequência. */
    public function clear(Lead $lead): Lead
    {
        // Direto no banco: a instância recebida pode estar desatualizada (ex.: armado por outro fluxo).
        Lead::withoutGlobalScopes()
            ->whereKey($lead->id)
            ->where(fn ($q) => $q->where('whatsapp_follow_up_step', '!=', 0)->orWhereNotNull('whatsapp_follow_up_due_at'))
            ->update(['whatsapp_follow_up_step' => 0, 'whatsapp_follow_up_due_at' => null]);

        $lead->forceFill([
            'whatsapp_follow_up_step' => 0,
            'whatsapp_follow_up_due_at' => null,
        ])->syncOriginalAttributes(['whatsapp_follow_up_step', 'whatsapp_follow_up_due_at']);

        return $lead;
    }
}
