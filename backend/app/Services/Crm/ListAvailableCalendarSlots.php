<?php

namespace App\Services\Crm;

use App\Services\Crm\Appointments\ListPanelBusyIntervals;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

class ListAvailableCalendarSlots
{
    public function __construct(
        private GoogleCalendarClient $calendar,
        private ListPanelBusyIntervals $panelBusy,
    ) {}

    /**
     * Horários livres dentro do expediente (sem títulos de eventos).
     * Sempre respeita a agenda do painel; com Google conectado, soma também o FreeBusy de lá.
     *
     * @param  array{data?: string|null, dias?: int|null, duracao_minutos?: int|null}  $arguments
     * @return array<string, mixed>
     */
    public function handle(array $arguments): array
    {
        $tz = $this->calendar->timezone();
        Carbon::setLocale('pt_BR');
        $dias = max(1, min(7, (int) ($arguments['dias'] ?? 1)));
        $slotMinutes = (int) ($arguments['duracao_minutos'] ?? $this->calendar->slotMinutes());
        $slotMinutes = max(15, min(180, $slotMinutes));

        $horaInicio = $this->calendar->businessHoursStart();
        $horaFim = $this->calendar->businessHoursEnd();
        if ($horaFim <= $horaInicio) {
            $horaInicio = 9;
            $horaFim = 18;
        }

        $dataRaw = trim((string) ($arguments['data'] ?? ''));
        try {
            $inicioDia = $dataRaw !== ''
                ? Carbon::parse($dataRaw, $tz)->startOfDay()
                : $this->proximoDiaUtil(now($tz))->startOfDay();
        } catch (Throwable) {
            throw new RuntimeException('data inválida. Use YYYY-MM-DD.');
        }

        $fimJanela = $inicioDia->copy()->addDays($dias)->startOfDay();
        if ($fimJanela->lessThanOrEqualTo($inicioDia)) {
            throw new RuntimeException('Intervalo de dias inválido.');
        }

        $busyIntervals = $this->panelBusy->handle($inicioDia, $fimJanela, $slotMinutes, $tz);
        $fonte = 'agenda do painel';

        if ($this->calendar->configured()) {
            try {
                foreach ($this->calendar->freeBusy($inicioDia->toIso8601String(), $fimJanela->toIso8601String()) as $block) {
                    try {
                        $busyIntervals[] = [
                            'start' => Carbon::parse($block['start'])->timezone($tz),
                            'end' => Carbon::parse($block['end'])->timezone($tz),
                        ];
                    } catch (Throwable) {
                        continue;
                    }
                }
                $fonte = 'Google Agenda + agenda do painel';
            } catch (Throwable $e) {
                // Google fora do ar não pode impedir o atendimento: segue só com o painel.
                Log::warning('FreeBusy do Google falhou; usando só a agenda do painel.', ['error' => $e->getMessage()]);
            }
        }

        $slots = [];
        for ($d = 0; $d < $dias; $d++) {
            $dia = $inicioDia->copy()->addDays($d);
            if ($dia->isWeekend()) {
                continue;
            }

            $cursor = $dia->copy()->setTime($horaInicio, 0, 0);
            $fimExpediente = $dia->copy()->setTime($horaFim, 0, 0);

            while ($cursor->copy()->addMinutes($slotMinutes)->lessThanOrEqualTo($fimExpediente)) {
                $slotStart = $cursor->copy();
                $slotEnd = $cursor->copy()->addMinutes($slotMinutes);

                if ($slotEnd->lessThanOrEqualTo(now($tz))) {
                    $cursor->addMinutes($slotMinutes);

                    continue;
                }

                if (! $this->overlapsBusy($slotStart, $slotEnd, $busyIntervals)) {
                    $slots[] = [
                        'inicio' => $slotStart->toIso8601String(),
                        'fim' => $slotEnd->toIso8601String(),
                        'rotulo' => $slotStart->translatedFormat('l d/m').' às '.$slotStart->format('H:i'),
                    ];
                }

                $cursor->addMinutes($slotMinutes);
            }
        }

        return [
            'ok' => true,
            'timezone' => $tz,
            'expediente' => sprintf('%02d:00–%02d:00', $horaInicio, $horaFim),
            'duracao_minutos' => $slotMinutes,
            'fonte' => $fonte,
            'total' => count($slots),
            'horarios' => $slots,
            // Nunca incluir títulos de eventos — FreeBusy só tem busy blocks.
            'aviso' => 'Ofereça ao lead apenas estes horários. Não invente slots nem mencione outros compromissos.',
        ];
    }

    /**
     * @param  list<array{start: Carbon, end: Carbon}>  $busyIntervals
     */
    private function overlapsBusy(Carbon $start, Carbon $end, array $busyIntervals): bool
    {
        foreach ($busyIntervals as $busy) {
            // overlap se start < busy.end && end > busy.start
            if ($start->lt($busy['end']) && $end->gt($busy['start'])) {
                return true;
            }
        }

        return false;
    }

    private function proximoDiaUtil(Carbon $from): Carbon
    {
        $dia = $from->copy()->startOfDay()->addDay();
        while ($dia->isWeekend()) {
            $dia->addDay();
        }

        return $dia;
    }
}
