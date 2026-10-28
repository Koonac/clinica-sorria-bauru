<?php

namespace App\Jobs\Crm;

use App\Models\Clinic;
use App\Models\Crm\Activity;
use App\Models\Crm\Agent;
use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use App\Services\Crm\CheckWhatsappFollowUpEligibility;
use App\Services\Crm\GenerateWhatsappFollowUpMessage;
use App\Services\Crm\ScheduleWhatsappFollowUp;
use App\Services\Crm\SendWhatsappSystemMessage;
use App\Services\Crm\UpdateLeadAttendanceStatus;
use App\Support\ClinicContext;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

class SendWhatsappFollowUpJob implements ShouldQueue, ShouldBeUnique
{
    use Queueable;

    public int $tries = 1;

    public int $uniqueFor = 600;

    /** Nova tentativa após falha de geração/envio. */
    private const RETRY_MINUTES = 15;

    public function __construct(public int $leadId) {}

    public function uniqueId(): string
    {
        return 'whatsapp-follow-up:'.$this->leadId;
    }

    public function handle(
        ClinicContext $clinicContext,
        CheckWhatsappFollowUpEligibility $eligibility,
        GenerateWhatsappFollowUpMessage $generator,
        SendWhatsappSystemMessage $sender,
        ScheduleWhatsappFollowUp $followUp,
        UpdateLeadAttendanceStatus $attendanceStatus,
    ): void {
        $lead = Lead::withoutGlobalScopes()->find($this->leadId);
        if (! $lead || ! $lead->whatsapp_follow_up_due_at || $lead->whatsapp_follow_up_due_at->isFuture()) {
            return;
        }

        $clinic = Clinic::query()->find($lead->clinic_id);
        if (! $clinic) {
            return;
        }
        $clinicContext->set($clinic);

        $connection = Connection::query()->where('clinic_id', $clinic->id)->first();
        if ($connection && ($connection->status !== 'connected' || ! filled($connection->session_id))) {
            // WhatsApp fora do ar: mantém a sequência e tenta no próximo ciclo.
            return;
        }

        $agent = Agent::activeForClinic((int) $clinic->id);
        $reason = $eligibility->handle($lead, $connection, $agent);
        if ($reason !== null) {
            $this->cancel($lead, $followUp, 'Follow-up automático cancelado', $reason);

            return;
        }

        $delays = $connection->resolvedFollowUpDelays();
        $attempt = (int) $lead->whatsapp_follow_up_step + 1;
        if ($attempt > count($delays)) {
            $followUp->clear($lead);

            return;
        }

        try {
            $text = $generator->handle($agent, $connection, $lead, $attempt, count($delays));
        } catch (Throwable $e) {
            $this->retryLater($lead, 'gerar', $e);

            return;
        }

        if ($text === null) {
            $this->cancel($lead, $followUp, 'Follow-up automático encerrado pela IA', 'a conversa não pedia novo contato');

            return;
        }

        try {
            $sender->handle($connection, $lead, $connection->applyAiDisplayNamePrefix($text), 'follow_up', $agent->user_id);
        } catch (Throwable $e) {
            $this->retryLater($lead, 'enviar', $e);

            return;
        }

        Activity::create([
            'type' => 'whatsapp',
            'subject' => "Follow-up automático {$attempt}/".count($delays),
            'body' => $text,
            'lead_id' => $lead->id,
            'meta' => ['follow_up' => true, 'attempt' => $attempt, 'agent_id' => $agent->id],
        ]);

        if (! $followUp->advance($lead, $connection)) {
            $attendanceStatus->handle($lead, Lead::ATTENDANCE_NO_REPLY, 'follow_up_exhausted');
        }
    }

    /**
     * Encerra a sequência deixando o motivo no histórico do lead (antes sumia em silêncio).
     */
    private function cancel(Lead $lead, ScheduleWhatsappFollowUp $followUp, string $subject, string $reason): void
    {
        $followUp->clear($lead);

        Activity::create([
            'type' => 'note',
            'subject' => $subject,
            'body' => 'Motivo: '.$reason.'.',
            'lead_id' => $lead->id,
            'meta' => ['follow_up' => true, 'skipped' => true, 'reason' => $reason],
        ]);

        Log::info('Follow-up do WhatsApp cancelado.', ['lead_id' => $lead->id, 'reason' => $reason]);
    }

    private function retryLater(Lead $lead, string $step, Throwable $e): void
    {
        $lead->forceFill(['whatsapp_follow_up_due_at' => now()->addMinutes(self::RETRY_MINUTES)])->save();

        Activity::create([
            'type' => 'note',
            'subject' => 'Follow-up automático adiado',
            'body' => "Falha ao {$step} a mensagem; nova tentativa em ".self::RETRY_MINUTES.' min. Erro: '.mb_substr($e->getMessage(), 0, 300),
            'lead_id' => $lead->id,
            'meta' => ['follow_up' => true, 'error' => $e->getMessage()],
        ]);

        Log::warning("Falha ao {$step} follow-up do WhatsApp.", ['lead_id' => $lead->id, 'error' => $e->getMessage()]);
    }
}
