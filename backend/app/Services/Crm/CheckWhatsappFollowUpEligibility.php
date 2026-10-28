<?php

namespace App\Services\Crm;

use App\Models\Crm\Agent;
use App\Models\Crm\Appointment;
use App\Models\Crm\Connection;
use App\Models\Crm\Lead;

/**
 * Diz por que um lead NÃO deve receber follow-up agora (null = pode enviar).
 * Usado pelo job (para cancelar com motivo registrado) e pelo comando de diagnóstico.
 */
class CheckWhatsappFollowUpEligibility
{
    public function __construct(private WhatsappChatHistory $history) {}

    public function handle(Lead $lead, ?Connection $connection, ?Agent $agent): ?string
    {
        if (! $connection) {
            return 'clínica sem conexão de WhatsApp';
        }
        if (! $connection->whatsapp_follow_up_enabled) {
            return 'follow-up desligado nas configurações';
        }
        if (! $agent || ! $agent->canActivate()) {
            return 'nenhum agent de IA ativo';
        }
        if ($lead->isWhatsappAgentPaused()) {
            return 'IA pausada neste lead (atendimento humano)';
        }
        if (in_array($lead->attendance_status, [Lead::ATTENDANCE_PRE_BOOKED, Lead::ATTENDANCE_SCHEDULED, Lead::ATTENDANCE_HUMAN], true)) {
            return 'status do contato é "'.$lead->attendance_status.'"';
        }
        if ($lead->appointments()->whereIn('status', Appointment::ACTIVE_STATUSES)->exists()) {
            return 'lead tem consulta ou pré-agendamento em aberto';
        }

        $latestInbound = $this->history->latestInbound($connection->id, $lead->id, $lead->whatsapp_jid);
        // JID @lid não traz telefone: usa também o número que veio nas mensagens do paciente.
        if (! $connection->allowsAutomationFor(
            $lead->mobile,
            $lead->whatsapp_jid,
            $latestInbound?->phone_number,
            $latestInbound?->whatsapp_jid,
        )) {
            return 'modo de teste ativo e este contato não é o número de teste';
        }

        $last = $this->history->messages($connection->id, $lead->id, $lead->whatsapp_jid, 1)->last();
        if ($last === null) {
            return 'conversa sem mensagens';
        }
        if ($last->direction !== 'outbound') {
            return 'a última mensagem é do paciente (a IA ainda vai responder)';
        }

        return null;
    }
}
