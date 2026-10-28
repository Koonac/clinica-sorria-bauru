<?php

namespace App\Console\Commands;

use App\Models\Clinic;
use App\Models\Crm\Activity;
use App\Models\Crm\Agent;
use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use App\Services\Crm\CheckWhatsappFollowUpEligibility;
use App\Services\Crm\WhatsappChatHistory;
use App\Support\ClinicContext;
use Illuminate\Console\Command;

/**
 * Somente leitura: mostra por que um lead recebe (ou não) follow-up automático.
 */
class DiagnoseWhatsappFollowUpCommand extends Command
{
    protected $signature = 'crm:follow-up-diagnose {lead : id do lead ou parte do nome}';

    protected $description = 'Mostra o estado do follow-up automático de um lead (não altera nada)';

    public function handle(
        CheckWhatsappFollowUpEligibility $eligibility,
        WhatsappChatHistory $history,
        ClinicContext $clinicContext,
    ): int {
        $needle = (string) $this->argument('lead');
        $lead = ctype_digit($needle)
            ? Lead::withoutGlobalScopes()->find((int) $needle)
            : Lead::withoutGlobalScopes()->where('name', 'ilike', '%'.$needle.'%')->latest('updated_at')->first();

        if (! $lead) {
            $this->error('Lead não encontrado.');

            return self::FAILURE;
        }

        $clinic = Clinic::query()->find($lead->clinic_id);
        if ($clinic) {
            $clinicContext->set($clinic);
        }

        $connection = Connection::withoutGlobalScopes()->where('clinic_id', $lead->clinic_id)->first();
        $agent = Agent::activeForClinic((int) $lead->clinic_id);
        $now = now();

        $this->line("Agora: {$now->toDateTimeString()} (".config('app.timezone').')');
        $this->line("Lead #{$lead->id} {$lead->name} · mobile={$lead->mobile} · jid={$lead->whatsapp_jid}");
        $this->line('Status do contato: '.$lead->attendance_status
            .' · IA pausada: '.($lead->isWhatsappAgentPaused() ? 'sim' : 'não')
            .' · conversa finalizada: '.($lead->isWhatsappConversationClosed() ? 'sim' : 'não'));
        $this->line('Follow-up: tentativas enviadas='.(int) $lead->whatsapp_follow_up_step
            .' · próximo='.($lead->whatsapp_follow_up_due_at?->toDateTimeString() ?? 'NENHUM AGENDADO'));

        if ($connection) {
            [$start, $end] = $connection->resolvedSendWindow();
            $this->line("Conexão: status={$connection->status} · follow-up ".($connection->whatsapp_follow_up_enabled ? 'LIGADO' : 'DESLIGADO')
                .' · atrasos(min)='.implode(', ', $connection->resolvedFollowUpDelays())
                ." · janela {$start}h–{$end}h (".($connection->isWithinSendWindow($now) ? 'dentro' : 'FORA').')'
                .' · modo de teste='.($connection->agent_test_phone ?: 'não'));
        }
        $this->line('Agent ativo: '.($agent ? $agent->name : 'NENHUM'));

        $reason = $eligibility->handle($lead, $connection, $agent);
        $this->newLine();
        $this->line($reason === null
            ? '<info>Elegível: o follow-up sai quando o horário agendado chegar (scheduler + fila precisam estar rodando).</info>'
            : "<comment>Bloqueado agora: {$reason}.</comment>");

        $this->newLine();
        $this->line('Últimas mensagens:');
        if ($connection) {
            foreach ($history->messages($connection->id, $lead->id, $lead->whatsapp_jid, 4) as $message) {
                $this->line(sprintf(
                    '  %s %-8s %s',
                    $message->wa_timestamp?->timezone(config('app.timezone'))->format('d/m H:i:s') ?? '?',
                    $message->direction,
                    mb_substr(str_replace("\n", ' ', (string) $message->body), 0, 70),
                ));
            }
        }

        $this->newLine();
        $this->line('Histórico relevante (follow-up / finalização):');
        Activity::withoutGlobalScopes()
            ->where('lead_id', $lead->id)
            ->where(fn ($q) => $q->where('subject', 'like', '%ollow-up%')->orWhere('subject', 'like', 'Conversa finalizada%')
                ->orWhere('subject', 'like', 'Motivo da finalização%'))
            ->latest('id')
            ->limit(8)
            ->get(['subject', 'body', 'created_at'])
            ->each(fn (Activity $a) => $this->line('  '.$a->created_at?->format('d/m H:i:s').' '.$a->subject.($a->body ? ' — '.mb_substr($a->body, 0, 90) : '')));

        return self::SUCCESS;
    }
}
