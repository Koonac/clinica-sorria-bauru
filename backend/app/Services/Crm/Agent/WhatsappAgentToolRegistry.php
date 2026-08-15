<?php

namespace App\Services\Crm\Agent;

use App\Services\Crm\Agent\Tools\ConsultarServicosTool;
use App\Services\Crm\Agent\Tools\CriarAgendamentoTool;
use App\Services\Crm\Agent\Tools\EnviarRespostaTool;
use App\Services\Crm\Agent\Tools\EscalarHumanoTool;
use App\Services\Crm\Agent\Tools\FinalizarAtendimentoTool;
use App\Services\Crm\Agent\Tools\ListarHorariosDisponiveisTool;
use App\Services\Crm\Agent\Tools\MoverLeadTool;
use RuntimeException;
use Throwable;

class WhatsappAgentToolRegistry
{
    /** @var array<string, AgentTool> */
    private array $tools;

    public function __construct(
        EnviarRespostaTool $enviar,
        MoverLeadTool $mover,
        CriarAgendamentoTool $agendar,
        ListarHorariosDisponiveisTool $horarios,
        ConsultarServicosTool $servicos,
        EscalarHumanoTool $escalar,
        FinalizarAtendimentoTool $finalizar,
    ) {
        $this->tools = [
            $enviar->name() => $enviar,
            $mover->name() => $mover,
            $agendar->name() => $agendar,
            $horarios->name() => $horarios,
            $servicos->name() => $servicos,
            $escalar->name() => $escalar,
            $finalizar->name() => $finalizar,
        ];
    }

    /**
     * @return list<array{type: string, function: array<string, mixed>}>
     */
    public function openAiTools(): array
    {
        $out = [];
        foreach ($this->tools as $tool) {
            $out[] = [
                'type' => 'function',
                'function' => $tool->schema(),
            ];
        }

        return $out;
    }

    /**
     * @param  array<string, mixed>  $arguments
     * @return array<string, mixed>
     */
    public function execute(string $name, array $arguments, AgentContext $context): array
    {
        $tool = $this->tools[$name] ?? null;
        if (! $tool) {
            throw new RuntimeException("Tool desconhecida: {$name}");
        }

        try {
            return $tool->handle($arguments, $context);
        } catch (Throwable $e) {
            return [
                'ok' => false,
                'error' => $e->getMessage(),
            ];
        }
    }
}
