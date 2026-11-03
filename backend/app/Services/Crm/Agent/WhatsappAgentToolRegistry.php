<?php

namespace App\Services\Crm\Agent;

use App\Models\Clinic;
use App\Services\Crm\Agent\Tools\ArmazenarInfoLeadTool;
use App\Services\Crm\Agent\Tools\AtualizarConsultaTool;
use App\Services\Crm\Agent\Tools\ConsultarImoveisTool;
use App\Services\Crm\Agent\Tools\ConsultarServicosTool;
use App\Services\Crm\Agent\Tools\CriarAgendamentoTool;
use App\Services\Crm\Agent\Tools\EnviarRespostaTool;
use App\Services\Crm\Agent\Tools\EscalarHumanoTool;
use App\Services\Crm\Agent\Tools\FinalizarAtendimentoTool;
use App\Services\Crm\Agent\Tools\ListarHorariosDisponiveisTool;
use App\Services\Crm\Agent\Tools\MoverLeadTool;
use App\Services\Crm\Agent\Tools\RegistrarPreAgendamentoTool;
use App\Support\ClinicContext;
use RuntimeException;
use Throwable;

class WhatsappAgentToolRegistry
{
    /** Tools que só existem em um dos modos de agendamento da conexão. */
    private const DIRECT_ONLY = ['criar_agendamento'];

    private const PRE_BOOKING_ONLY = ['registrar_pre_agendamento'];

    private const CLINICA_ONLY = ['consultar_servicos'];

    private const IMOBILIARIA_ONLY = ['consultar_imoveis'];

    /** @var array<string, AgentTool> */
    private array $tools;

    public function __construct(
        EnviarRespostaTool $enviar,
        MoverLeadTool $mover,
        ArmazenarInfoLeadTool $armazenarInfo,
        CriarAgendamentoTool $agendar,
        RegistrarPreAgendamentoTool $preAgendar,
        AtualizarConsultaTool $atualizarConsulta,
        ListarHorariosDisponiveisTool $horarios,
        ConsultarServicosTool $servicos,
        ConsultarImoveisTool $imoveis,
        EscalarHumanoTool $escalar,
        FinalizarAtendimentoTool $finalizar,
    ) {
        $this->tools = [
            $enviar->name() => $enviar,
            $mover->name() => $mover,
            $armazenarInfo->name() => $armazenarInfo,
            $agendar->name() => $agendar,
            $preAgendar->name() => $preAgendar,
            $atualizarConsulta->name() => $atualizarConsulta,
            $horarios->name() => $horarios,
            $servicos->name() => $servicos,
            $imoveis->name() => $imoveis,
            $escalar->name() => $escalar,
            $finalizar->name() => $finalizar,
        ];
    }

    /**
     * @return list<array{type: string, function: array<string, mixed>}>
     */
    public function openAiTools(?AgentContext $context = null): array
    {
        $out = [];
        foreach ($this->tools as $name => $tool) {
            if ($context && ! $this->availableFor($name, $context)) {
                continue;
            }
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

        if (! $this->availableFor($name, $context)) {
            return [
                'ok' => false,
                'error' => "A tool {$name} não está disponível no modo de agendamento desta clínica.",
            ];
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

    private function availableFor(string $name, AgentContext $context): bool
    {
        $preBooking = $context->connection->isPreBookingMode();

        if ($preBooking && in_array($name, self::DIRECT_ONLY, true)) {
            return false;
        }

        if (! $preBooking && in_array($name, self::PRE_BOOKING_ONLY, true)) {
            return false;
        }

        $imobiliaria = $this->isImobiliaria($context);
        if ($imobiliaria && in_array($name, self::CLINICA_ONLY, true)) {
            return false;
        }
        if (! $imobiliaria && in_array($name, self::IMOBILIARIA_ONLY, true)) {
            return false;
        }

        return true;
    }

    private function isImobiliaria(AgentContext $context): bool
    {
        $clinic = app(ClinicContext::class)->clinic();
        if ($clinic) {
            return $clinic->isImobiliaria();
        }

        $template = Clinic::query()
            ->whereKey($context->connection->clinic_id)
            ->value('template');

        return $template === Clinic::TEMPLATE_IMOBILIARIA;
    }
}
