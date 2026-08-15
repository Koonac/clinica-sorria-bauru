<?php

namespace App\Services\Crm\Agent\Tools;

use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\AgentTool;
use App\Services\Crm\GoogleCalendarClient;
use Carbon\Carbon;
use RuntimeException;
use Throwable;

class ListarHorariosDisponiveisTool implements AgentTool
{
    public function __construct(private GoogleCalendarClient $calendar) {}

    public function name(): string
    {
        return 'listar_horarios_disponiveis';
    }

    public function schema(): array
    {
        return [
            'name' => $this->name(),
            'description' => 'Lista horários livres na agenda (FreeBusy). Não revela nome/descrição de outros compromissos — só slots disponíveis. Use antes de oferecer opções ao lead.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'data' => [
                        'type' => 'string',
                        'description' => 'Dia no formato YYYY-MM-DD (fuso America/Sao_Paulo). Se omitido, usa o próximo dia útil.',
                    ],
                    'dias' => [
                        'type' => 'integer',
                        'description' => 'Quantidade de dias a partir de data (1–7). Default 1.',
                    ],
                    'duracao_minutos' => [
                        'type' => 'integer',
                        'description' => 'Duração de cada slot em minutos (15–180). Default da config (60).',
                    ],
                ],
                'required' => [],
            ],
        ];
    }

    public function handle(array $arguments, AgentContext $context): array
    {
        if (! $this->calendar->configured()) {
            throw new RuntimeException('Google Calendar não configurado.');
        }

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

        $busy = $this->calendar->freeBusy(
            $inicioDia->toIso8601String(),
            $fimJanela->toIso8601String(),
        );

        $busyIntervals = [];
        foreach ($busy as $block) {
            try {
                $busyIntervals[] = [
                    'start' => Carbon::parse($block['start'])->timezone($tz),
                    'end' => Carbon::parse($block['end'])->timezone($tz),
                ];
            } catch (Throwable) {
                continue;
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
