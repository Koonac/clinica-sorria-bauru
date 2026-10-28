<?php

namespace App\Services\Crm\Appointments;

use App\Models\Crm\Appointment;
use App\Models\Crm\Task;
use Carbon\Carbon;
use Carbon\CarbonInterface;

/**
 * Horários ocupados na agenda do próprio painel (sem Google): consultas marcadas/confirmadas e
 * tarefas pendentes da Agenda (as consultas também geram tarefa; não conta duas vezes).
 */
class ListPanelBusyIntervals
{
    /**
     * @param  int  $defaultMinutes  duração assumida para tarefas e consultas sem horário de fim
     * @param  int|null  $ignoreAppointmentId  consulta sendo remarcada/confirmada (não conflita consigo)
     * @param  int|null  $ignoreLeadId  ignora consultas/tarefas deste lead (remarcação)
     * @return list<array{start: Carbon, end: Carbon}>
     */
    public function handle(
        CarbonInterface $from,
        CarbonInterface $to,
        int $defaultMinutes,
        string $timezone,
        ?int $ignoreAppointmentId = null,
        ?int $ignoreLeadId = null,
    ): array {
        // Margem de 1 dia para pegar blocos que começam antes da janela e invadem o início dela.
        $lookFrom = Carbon::instance($from)->subDay();
        $lookTo = Carbon::instance($to);

        $appointments = Appointment::query()
            ->whereIn('status', [Appointment::STATUS_SCHEDULED, Appointment::STATUS_CONFIRMED])
            ->whereNotNull('starts_at')
            ->whereBetween('starts_at', [$lookFrom, $lookTo])
            ->when($ignoreAppointmentId, fn ($q) => $q->whereKeyNot($ignoreAppointmentId))
            ->get(['id', 'lead_id', 'starts_at', 'ends_at', 'task_id']);

        $intervals = [];
        $appointmentTaskIds = [];
        foreach ($appointments as $appointment) {
            if ($appointment->task_id) {
                $appointmentTaskIds[] = (int) $appointment->task_id;
            }
            if ($ignoreLeadId !== null && (int) $appointment->lead_id === $ignoreLeadId) {
                continue;
            }
            $start = $appointment->starts_at->copy()->timezone($timezone);
            $end = $appointment->ends_at?->copy()->timezone($timezone) ?? $start->copy()->addMinutes($defaultMinutes);
            $intervals[] = ['start' => $start, 'end' => $end];
        }

        $ignoredTaskId = $ignoreAppointmentId
            ? Appointment::query()->whereKey($ignoreAppointmentId)->value('task_id')
            : null;

        $tasks = Task::query()
            ->whereNull('done_at')
            ->whereBetween('due_at', [$lookFrom, $lookTo])
            ->when($appointmentTaskIds !== [], fn ($q) => $q->whereNotIn('id', $appointmentTaskIds))
            ->when($ignoredTaskId, fn ($q) => $q->whereKeyNot($ignoredTaskId))
            ->when($ignoreLeadId !== null, fn ($q) => $q->where(fn ($inner) => $inner
                ->whereNull('lead_id')
                ->orWhere('lead_id', '!=', $ignoreLeadId)))
            ->get(['id', 'due_at']);

        foreach ($tasks as $task) {
            $start = $task->due_at->copy()->timezone($timezone);
            $intervals[] = ['start' => $start, 'end' => $start->copy()->addMinutes($defaultMinutes)];
        }

        return $intervals;
    }
}
