<?php

namespace App\Services\Crm;

use App\Models\Crm\Activity;
use App\Models\Crm\Lead;

class UpdateLeadAttendanceStatus
{
    /** Transições que viram histórico no lead (as demais são só estado). */
    private const LOGGED = [
        Lead::ATTENDANCE_HUMAN,
        Lead::ATTENDANCE_PRE_BOOKED,
        Lead::ATTENDANCE_SCHEDULED,
        Lead::ATTENDANCE_NO_REPLY,
    ];

    private const LABELS = [
        Lead::ATTENDANCE_NEW => 'Novo',
        Lead::ATTENDANCE_IN_PROGRESS => 'Em atendimento',
        Lead::ATTENDANCE_HUMAN => 'Com humano',
        Lead::ATTENDANCE_PRE_BOOKED => 'Pré-agendado',
        Lead::ATTENDANCE_SCHEDULED => 'Agendado',
        Lead::ATTENDANCE_NO_REPLY => 'Sem resposta',
    ];

    /**
     * @param  list<string>|null  $onlyFrom  só aplica se o status atual estiver nesta lista
     */
    public function handle(Lead $lead, string $status, string $reason, ?array $onlyFrom = null, ?int $userId = null): Lead
    {
        if (! in_array($status, Lead::ATTENDANCE_STATUSES, true)) {
            return $lead;
        }

        // Lê do banco: outra instância do mesmo lead pode ter mudado o status neste request/job.
        $current = (string) (Lead::withoutGlobalScopes()->whereKey($lead->id)->value('attendance_status')
            ?: Lead::ATTENDANCE_NEW);
        if ($current === $status) {
            $lead->forceFill(['attendance_status' => $status])->syncOriginalAttribute('attendance_status');

            return $lead;
        }
        if ($onlyFrom !== null && ! in_array($current, $onlyFrom, true)) {
            $lead->forceFill(['attendance_status' => $current])->syncOriginalAttribute('attendance_status');

            return $lead;
        }

        Lead::withoutGlobalScopes()->whereKey($lead->id)->update(['attendance_status' => $status]);
        $lead->forceFill(['attendance_status' => $status])->syncOriginalAttribute('attendance_status');

        if (in_array($status, self::LOGGED, true)) {
            Activity::create([
                'type' => 'note',
                'subject' => 'Status de atendimento: '.self::LABELS[$status],
                'lead_id' => $lead->id,
                'user_id' => $userId,
                'meta' => [
                    'attendance_status' => $status,
                    'previous_attendance_status' => $current,
                    'reason' => $reason,
                ],
            ]);
        }

        return $lead;
    }
}
