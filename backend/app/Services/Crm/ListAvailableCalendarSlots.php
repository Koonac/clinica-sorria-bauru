<?php

namespace App\Services\Crm;

use App\Models\Clinic;
use App\Services\Crm\Appointments\ListPanelBusyIntervals;
use App\Support\ClinicContext;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

class ListAvailableCalendarSlots
{
    public function __construct(
        private GoogleCalendarClient $calendar,
        private ListPanelBusyIntervals $panelBusy,
        private ClinicContext $clinicContext,
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

        $clinic = $this->clinicContext->clinic()
            ?? Clinic::query()->find($this->clinicContext->id());
        // Horário por dia da semana (configurações › horário de atendimento); dias ausentes = fechado.
        $businessHours = $clinic?->resolvedBusinessHours() ?? (new Clinic)->resolvedBusinessHours();

        $dataRaw = trim((string) ($arguments['data'] ?? ''));
        try {
            $inicioDia = $dataRaw !== ''
                ? Carbon::parse($dataRaw, $tz)->startOfDay()
                : now($tz)->startOfDay(); // sem data = a partir de hoje (horários já passados são descartados)
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
            $horario = $businessHours[$dia->dayOfWeekIso] ?? null;
            if ($horario === null) {
                continue;
            }

            [$hIni, $mIni] = array_map('intval', explode(':', $horario['start']));
            [$hFim, $mFim] = array_map('intval', explode(':', $horario['end']));
            $cursor = $dia->copy()->setTime($hIni, $mIni, 0);
            $fimExpediente = $dia->copy()->setTime($hFim, $mFim, 0);

            while ($cursor->copy()->addMinutes($slotMinutes)->lessThanOrEqualTo($fimExpediente)) {
                $slotStart = $cursor->copy();
                $slotEnd = $cursor->copy()->addMinutes($slotMinutes);

                if ($slotStart->lessThanOrEqualTo(now($tz))) {
                    $cursor->addMinutes($slotMinutes);

                    continue;
                }

                if (! $this->overlapsBusy($slotStart, $slotEnd, $busyIntervals)) {
                    $slots[] = [
                        'inicio' => $slotStart->toIso8601String(),
                        'fim' => $slotEnd->toIso8601String(),
                        'rotulo' => $this->dayLabel($slotStart, $tz).' às '.$slotStart->format('H:i'),
                    ];
                }

                $cursor->addMinutes($slotMinutes);
            }
        }

        return [
            'ok' => true,
            'timezone' => $tz,
            'hoje' => now($tz)->locale('pt_BR')->translatedFormat('l, d/m/Y'),
            'expediente' => $clinic?->businessHoursSummary() ?? (new Clinic)->businessHoursSummary(),
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

    /**
     * "hoje (quarta-feira 28/10)", "amanhã (quinta-feira 29/10)" ou "sexta-feira 30/10".
     * Deixa explícito de que dia é o horário — o modelo confundia "amanhã" com "hoje".
     */
    private function dayLabel(Carbon $day, string $tz): string
    {
        $label = $day->copy()->locale('pt_BR')->translatedFormat('l d/m');
        $today = now($tz)->startOfDay();
        $date = $day->copy()->startOfDay();

        if ($date->equalTo($today)) {
            return "hoje ({$label})";
        }
        if ($date->equalTo($today->copy()->addDay())) {
            return "amanhã ({$label})";
        }

        return $label;
    }
}
