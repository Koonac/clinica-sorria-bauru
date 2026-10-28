<?php

namespace App\Services\Crm\Appointments;

use App\Models\Clinic;
use App\Models\Crm\Appointment;
use App\Models\Crm\Connection;
use App\Services\Crm\SendWhatsappSystemMessage;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Avisa o paciente pelo WhatsApp que a consulta foi marcada (confirmação da recepção).
 */
class SendAppointmentScheduledNotice
{
    public function __construct(private SendWhatsappSystemMessage $sender) {}

    /**
     * @return array{sent: bool, error: ?string}
     */
    public function handle(Appointment $appointment, ?int $userId = null): array
    {
        $lead = $appointment->lead()->first();
        $connection = Connection::query()->where('clinic_id', $appointment->clinic_id)->first();
        if (! $lead || ! $connection || ! $appointment->starts_at) {
            return ['sent' => false, 'error' => 'Sem lead, conexão ou horário.'];
        }

        $startsAt = $appointment->starts_at->timezone(config('app.timezone'));
        $clinicName = Clinic::query()->whereKey($appointment->clinic_id)->value('name');
        $nome = trim((string) explode(' ', trim((string) $lead->name))[0]);

        $text = sprintf(
            'Olá%s! Sua consulta%s foi agendada para %s, às %s%s. Qualquer dúvida, é só chamar por aqui.',
            $nome !== '' ? ', '.$nome : '',
            filled($appointment->title) ? ' ('.$appointment->title.')' : '',
            $startsAt->format('d/m'),
            $startsAt->format('H:i'),
            $clinicName ? ', na '.$clinicName : '',
        );

        try {
            $this->sender->handle($connection, $lead, $connection->applyAiDisplayNamePrefix($text), 'appointment_scheduled', $userId);
        } catch (Throwable $e) {
            Log::warning('Falha ao avisar paciente sobre consulta agendada.', [
                'appointment_id' => $appointment->id,
                'message' => $e->getMessage(),
            ]);

            return ['sent' => false, 'error' => $e->getMessage()];
        }

        return ['sent' => true, 'error' => null];
    }
}
