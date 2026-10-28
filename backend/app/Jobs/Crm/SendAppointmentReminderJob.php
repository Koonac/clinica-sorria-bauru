<?php

namespace App\Jobs\Crm;

use App\Models\Clinic;
use App\Models\Crm\Activity;
use App\Models\Crm\Appointment;
use App\Models\Crm\Connection;
use App\Services\Crm\SendWhatsappSystemMessage;
use App\Support\ClinicContext;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Lembrete de consulta pedindo confirmação de presença (resposta tratada pelo agent).
 */
class SendAppointmentReminderJob implements ShouldQueue, ShouldBeUnique
{
    use Queueable;

    public int $tries = 1;

    public int $uniqueFor = 3600;

    public function __construct(public int $appointmentId) {}

    public function uniqueId(): string
    {
        return 'appointment-reminder:'.$this->appointmentId;
    }

    public function handle(ClinicContext $clinicContext, SendWhatsappSystemMessage $sender): void
    {
        $appointment = Appointment::withoutGlobalScopes()->find($this->appointmentId);
        if (! $appointment
            || $appointment->status !== Appointment::STATUS_SCHEDULED
            || $appointment->reminder_sent_at !== null
            || ! $appointment->starts_at
            || $appointment->starts_at->isPast()) {
            return;
        }

        $clinic = Clinic::query()->find($appointment->clinic_id);
        if (! $clinic) {
            return;
        }
        $clinicContext->set($clinic);

        $connection = Connection::query()->where('clinic_id', $clinic->id)->first();
        $lead = $appointment->lead()->first();
        if (! $connection || ! $lead || ! $connection->appointment_reminder_enabled) {
            return;
        }
        // Modo de teste: não manda lembrete para pacientes reais (fica pendente até sair do teste).
        if (! $connection->allowsAutomationFor($lead->mobile, $lead->whatsapp_jid)) {
            return;
        }

        $text = $this->render($connection->resolvedReminderTemplate(), $appointment, (string) ($lead->name ?? ''), $clinic->name);

        try {
            $sender->handle($connection, $lead, $connection->applyAiDisplayNamePrefix($text), 'appointment_reminder');
        } catch (Throwable $e) {
            Log::warning('Falha ao enviar lembrete de consulta.', [
                'appointment_id' => $appointment->id,
                'error' => $e->getMessage(),
            ]);

            return;
        }

        $appointment->forceFill(['reminder_sent_at' => now()])->save();

        Activity::create([
            'type' => 'whatsapp',
            'subject' => 'Lembrete de consulta enviado',
            'body' => $text,
            'lead_id' => $lead->id,
            'meta' => ['appointment_id' => $appointment->id, 'reminder' => true],
        ]);
    }

    private function render(string $template, Appointment $appointment, string $leadName, ?string $clinicName): string
    {
        $startsAt = $appointment->starts_at->copy()->timezone(config('app.timezone'));
        $firstName = trim((string) explode(' ', trim($leadName))[0]);

        $replacements = [
            '{nome}' => $firstName !== '' ? $firstName : 'tudo bem',
            '{quando}' => $this->whenLabel($startsAt),
            '{data}' => $startsAt->format('d/m'),
            '{hora}' => $startsAt->format('H:i'),
            '{clinica}' => $clinicName ?: 'clínica',
            '{servico}' => $appointment->service()->value('name') ?? ($appointment->title ?: 'consulta'),
        ];

        return strtr($template, $replacements);
    }

    private function whenLabel(CarbonInterface $startsAt): string
    {
        $today = now(config('app.timezone'))->startOfDay();
        $day = $startsAt->copy()->startOfDay();

        return match (true) {
            $day->equalTo($today) => 'hoje',
            $day->equalTo($today->copy()->addDay()) => 'amanhã',
            default => 'no dia '.$startsAt->format('d/m'),
        };
    }
}
