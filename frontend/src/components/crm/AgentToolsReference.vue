<script setup lang="ts">
import { Icon } from '@iconify/vue'

type ToolMode = 'sempre' | 'direto' | 'pre'

/** Espelha WhatsappAgentToolRegistry (backend). Apenas informativo para quem escreve o prompt. */
const TOOLS: { name: string; description: string; mode: ToolMode }[] = [
  {
    name: 'enviar_resposta',
    description: 'Envia a mensagem ao paciente no WhatsApp. É o único jeito de a IA falar com ele.',
    mode: 'sempre',
  },
  {
    name: 'consultar_servicos',
    description: 'Busca procedimentos, preços e cobertura por convênio cadastrados em Serviços.',
    mode: 'sempre',
  },
  {
    name: 'listar_horarios_disponiveis',
    description: 'Consulta os horários livres no Google Agenda dentro do expediente.',
    mode: 'sempre',
  },
  {
    name: 'criar_agendamento',
    description: 'Marca (ou remarca) a consulta direto na agenda e no CRM.',
    mode: 'direto',
  },
  {
    name: 'registrar_pre_agendamento',
    description: 'Anota o dia/horário preferido e avisa a recepção, que confirma em Consultas.',
    mode: 'pre',
  },
  {
    name: 'atualizar_consulta',
    description: 'Confirma presença ou cancela uma consulta já marcada (resposta ao lembrete).',
    mode: 'sempre',
  },
  {
    name: 'mover_lead',
    description: 'Muda a etapa do lead no funil do CRM.',
    mode: 'sempre',
  },
  {
    name: 'escalar_humano',
    description:
      'Pausa a IA, transfere para um atendente e avisa a recepção (urgência, reclamação, pedido de atendente).',
    mode: 'sempre',
  },
  {
    name: 'finalizar_atendimento',
    description: 'Encerra o atendimento quando o pedido foi resolvido.',
    mode: 'sempre',
  },
]

const MODE_LABEL: Record<ToolMode, string> = {
  sempre: 'Sempre',
  direto: 'Agendamento direto',
  pre: 'Pré-agendamento',
}

const MODE_TONE: Record<ToolMode, string> = {
  sempre: 'bg-brand-ink/5 text-brand-ink/60',
  direto: 'bg-brand-cyan/15 text-brand-cyan-ink',
  pre: 'bg-violet-500/15 text-violet-700',
}
</script>

<template>
  <details open class="group rounded-xl border border-brand-ink/10 bg-[#f8fafb]">
    <summary
      class="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-brand-ink/80 select-none"
    >
      <Icon icon="lucide:wrench" class="size-4 text-brand-cyan-ink" aria-hidden="true" />
      Ferramentas disponíveis para o agent
      <span class="text-xs font-normal text-brand-ink/45">(informativo)</span>
      <Icon
        icon="lucide:chevron-down"
        class="ml-auto size-4 text-brand-ink/40 transition group-open:rotate-180"
        aria-hidden="true"
      />
    </summary>

    <div class="border-t border-brand-ink/10 px-4 pt-3 pb-4">
      <p class="mb-3 text-xs leading-relaxed text-brand-ink/55">
        O sistema já ensina a IA a usar essas ferramentas — você não precisa explicá-las. Pode
        citá-las pelo nome no prompt para ajustar quando usar (ex.: “só use escalar_humano depois de
        tentar resolver”). Horários, endereço e convênios vêm da Base de conhecimento.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[30rem] border-collapse text-left text-sm">
          <thead class="text-xs text-brand-ink/50">
            <tr class="border-b border-brand-ink/10">
              <th class="py-2 pr-3 font-medium">Ferramenta</th>
              <th class="py-2 pr-3 font-medium">O que faz</th>
              <th class="py-2 font-medium">Disponível</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="tool in TOOLS"
              :key="tool.name"
              class="border-b border-brand-ink/5 align-top"
            >
              <td class="py-2 pr-3">
                <code class="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-brand-ink">
                  {{ tool.name }}
                </code>
              </td>
              <td class="py-2 pr-3 text-brand-ink/70">{{ tool.description }}</td>
              <td class="py-2">
                <span
                  class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
                  :class="MODE_TONE[tool.mode]"
                >
                  {{ MODE_LABEL[tool.mode] }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs text-brand-ink/45">
        O modo de agendamento (direto ou pré-agendamento) é escolhido em Configurações › WhatsApp.
      </p>
    </div>
  </details>
</template>
