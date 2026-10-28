<?php

namespace App\Jobs\Crm;

use App\Models\Clinic;
use App\Models\Crm\Activity;
use App\Models\Crm\Agent;
use App\Models\Crm\Appointment;
use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use App\Services\Crm\GenerateWhatsappFollowUpMessage;
use App\Services\Crm\ScheduleWhatsappFollowUp;
use App\Services\Crm\SendWhatsappSystemMessage;
use App\Services\Crm\UpdateLeadAttendanceStatus;
use App\Services\Crm\WhatsappChatHistory;
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

    public function __construct(public int $leadId) {}

    public function uniqueId(): string
    {
        return 'whatsapp-follow-up:'.$this->leadId;
    }

    public function handle(
        ClinicContext $clinicContext,
        WhatsappChatHistory $history,
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
        if (! $connection || ! $connection->whatsapp_follow_up_enabled) {
            $followUp->clear($lead);

            return;
        }
        if ($connection->status !== 'connected' || ! filled($connection->session_id)) {
            return;
        }

        $agent = Agent::activeForClinic((int) $clinic->id);
        if (! $agent || ! $agent->canActivate() || ! $this->stillWaitingForPatient($lead, $connection, $history)) {
            $followUp->clear($lead);

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
            // Tenta de novo no próximo ciclo do scheduler, sem perder a sequência.
            $lead->forceFill(['whatsapp_follow_up_due_at' => now()->addMinutes(15)])->save();
            Log::warning('Falha ao gerar follow-up do WhatsApp.', ['lead_id' => $lead->id, 'error' => $e->getMessage()]);

            return;
        }

        if ($text === null) {
            $followUp->clear($lead);
            Activity::create([
                'type' => 'note',
                'subject' => 'Follow-up automático encerrado pela IA',
                'body' => 'A conversa não pedia novo contato.',
                'lead_id' => $lead->id,
                'meta' => ['follow_up' => true, 'attempt' => $attempt, 'skipped' => true],
            ]);

            return;
        }

        try {
            $sender->handle($connection, $lead, $connection->applyAiDisplayNamePrefix($text), 'follow_up', $agent->user_id);
        } catch (Throwable $e) {
            $lead->forceFill(['whatsapp_follow_up_due_at' => now()->addMinutes(15)])->save();
            Log::warning('Falha ao enviar follow-up do WhatsApp.', ['lead_id' => $lead->id, 'error' => $e->getMessage()]);

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

    private function stillWaitingForPatient(Lead $lead, Connection $connection, WhatsappChatHistory $history): bool
    {
        if ($lead->isWhatsappAgentPaused()
            || in_array($lead->attendance_status, [Lead::ATTENDANCE_PRE_BOOKED, Lead::ATTENDANCE_SCHEDULED, Lead::ATTENDANCE_HUMAN], true)) {
            return false;
        }

        if ($lead->appointments()->whereIn('status', Appointment::ACTIVE_STATUSES)->exists()) {
            return false;
        }

        $last = $history->messages($connection->id, $lead->id, $lead->whatsapp_jid, 1)->last();

        // Só insiste se a clínica falou por último (o paciente não respondeu).
        return $last !== null && $last->direction === 'outbound';
    }
}
