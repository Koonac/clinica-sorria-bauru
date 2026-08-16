<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Filler,
} from 'chart.js'
import type { AttendanceStats } from '@/api/crm/stats'
import { formatMoney, isTerminalStage, type LeadsPorDiaPoint, type PipelineStage } from '@/api/crm/types'
import ContentSkeleton from '@/components/Feedback/ContentSkeleton.vue'
import { formatDurationSeconds } from '@/utils/crmFormat'

Chart.register(
  CategoryScale,
  LinearScale,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Filler,
)

const props = defineProps<{
  loading: boolean
  error: string
  contactTotal: number
  leadStages: PipelineStage[]
  dealStages: PipelineStage[]
  convertedTotal: number
  leadsPorDia: LeadsPorDiaPoint[]
  attendance: AttendanceStats | null
}>()

const chartCanvas = ref<HTMLCanvasElement | null>(null)
const barCanvas = ref<HTMLCanvasElement | null>(null)
let lineChart: Chart | null = null
let barChart: Chart | null = null

const leadsAtivos = computed(() =>
  props.leadStages
    .filter((st) => !st.is_lost)
    .reduce((s, st) => s + (st.leads?.length || 0), 0),
)
const leadsPerdidos = computed(() =>
  props.leadStages
    .filter((st) => st.is_lost)
    .reduce((s, st) => s + (st.leads?.length || 0), 0),
)

const allDeals = computed(() =>
  props.dealStages.flatMap((st) => (st.deals || []).map((d) => ({ ...d, stage: st }))),
)
const abertos = computed(() => allDeals.value.filter((d) => d.stage && !isTerminalStage(d.stage)))
const ganhos = computed(() => allDeals.value.filter((d) => d.stage?.is_won))
const perdidos = computed(() => allDeals.value.filter((d) => d.stage?.is_lost))
const valorPipeline = computed(() =>
  abertos.value.reduce((s, d) => s + (Number(d.value) || 0), 0),
)
const valorGanhos = computed(() => ganhos.value.reduce((s, d) => s + (Number(d.value) || 0), 0))

const crmKpis = computed(() => [
  { label: 'Contatos', value: String(props.contactTotal) },
  { label: 'Leads ativos', value: String(leadsAtivos.value) },
  { label: 'Convertidos', value: String(props.convertedTotal) },
  { label: 'Leads perdidos', value: String(leadsPerdidos.value) },
  { label: 'Negócios abertos', value: String(abertos.value.length) },
  { label: 'Valor do pipeline', value: formatMoney(valorPipeline.value) },
  {
    label: 'Negócios ganhos',
    value: `${ganhos.value.length} · ${formatMoney(valorGanhos.value)}`,
  },
  { label: 'Negócios perdidos', value: String(perdidos.value.length) },
])

const attendanceClientKpis = computed(() => {
  const a = props.attendance
  if (!a) return []
  return [
    { label: 'Clientes atendidos (total)', value: String(a.clients_total) },
    { label: 'Atendidos pela IA', value: String(a.clients_ai) },
    { label: 'Atendidos por humano', value: String(a.clients_human) },
    {
      label: 'Em atendimento agora',
      value: `IA ${a.open_ai} · Humano ${a.open_human}`,
    },
  ]
})

const attendanceTimeKpis = computed(() => {
  const a = props.attendance
  if (!a) return []
  return [
    { label: 'Tempo com IA', value: formatDurationSeconds(a.total_ai_seconds) },
    { label: 'Tempo com humanos', value: formatDurationSeconds(a.total_human_seconds) },
    {
      label: 'Média por atendimento humano',
      value: formatDurationSeconds(a.avg_human_seconds),
    },
  ]
})

const clientShare = computed(() => {
  const a = props.attendance
  if (!a) return { aiPct: 0, humanPct: 0 }
  const total = a.clients_ai + a.clients_human
  if (total <= 0) return { aiPct: 0, humanPct: 0 }
  const aiPct = Math.round((a.clients_ai / total) * 100)
  return { aiPct, humanPct: 100 - aiPct }
})

const funnelSteps = computed(() => {
  const stages = props.leadStages.filter((s) => !s.is_lost)
  const steps = stages.map((s) => ({
    name: s.name,
    count: s.leads?.length || 0,
    color: s.color || '#0708f8',
  }))
  if (props.convertedTotal > 0 || steps.length) {
    steps.push({
      name: 'Convertidos',
      count: props.convertedTotal,
      color: '#16a34a',
    })
  }
  const max = Math.max(1, ...steps.map((s) => s.count))
  return steps.map((s) => ({
    ...s,
    pct: Math.round((s.count / max) * 100),
  }))
})

function renderCharts() {
  if (lineChart) {
    lineChart.destroy()
    lineChart = null
  }
  if (barChart) {
    barChart.destroy()
    barChart = null
  }

  if (chartCanvas.value && props.leadsPorDia.length) {
    lineChart = new Chart(chartCanvas.value, {
      type: 'line',
      data: {
        labels: props.leadsPorDia.map((p) => p.date.slice(5)),
        datasets: [
          {
            label: 'Leads',
            data: props.leadsPorDia.map((p) => p.total),
            borderColor: '#0708f8',
            backgroundColor: 'rgba(7, 8, 248, 0.12)',
            fill: true,
            tension: 0.35,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    })
  }

  if (barCanvas.value && props.dealStages.length) {
    barChart = new Chart(barCanvas.value, {
      type: 'bar',
      data: {
        labels: props.dealStages.map((s) => s.name),
        datasets: [
          {
            label: 'Negócios',
            data: props.dealStages.map((s) => s.deals?.length || 0),
            backgroundColor: props.dealStages.map((s) => s.color || '#00e1ff'),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    })
  }
}

watch(
  () => [props.loading, props.leadsPorDia, props.dealStages, props.leadStages],
  async () => {
    if (props.loading) return
    await nextTick()
    renderCharts()
  },
  { deep: true },
)

onBeforeUnmount(() => {
  lineChart?.destroy()
  barChart?.destroy()
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto">
    <p v-if="error" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </p>

    <ContentSkeleton v-if="loading" variant="dashboard" />

    <template v-else>
      <section v-if="attendance" class="space-y-4">
        <header class="space-y-1">
          <h2 class="text-base font-semibold text-brand-ink">Atendimento WhatsApp</h2>
          <p class="text-sm text-brand-ink/50">
            Clientes e tempos dos últimos {{ attendance.dias }} dias
          </p>
        </header>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article
            v-for="kpi in attendanceClientKpis"
            :key="kpi.label"
            class="rounded-2xl border border-brand-ink/10 bg-white px-4 py-4"
          >
            <p class="text-[0.7rem] font-medium tracking-wider text-brand-ink/45 uppercase">
              {{ kpi.label }}
            </p>
            <p class="mt-2 text-xl font-semibold text-brand-ink">{{ kpi.value }}</p>
          </article>
        </div>

        <div class="rounded-2xl border border-brand-ink/10 bg-white p-4">
          <p class="text-xs font-medium tracking-wide text-brand-ink/45 uppercase">
            Distribuição de clientes · IA × humano
          </p>
          <div class="mt-3 flex h-3 overflow-hidden rounded-full bg-brand-ink/5">
            <div
              class="h-full bg-brand-cyan transition-all"
              :style="{ width: `${clientShare.aiPct}%` }"
              :title="`IA ${clientShare.aiPct}%`"
            />
            <div
              class="h-full bg-brand-blue transition-all"
              :style="{ width: `${clientShare.humanPct}%` }"
              :title="`Humano ${clientShare.humanPct}%`"
            />
          </div>
          <div class="mt-2 flex flex-wrap gap-4 text-xs text-brand-ink/55">
            <span>IA {{ attendance.clients_ai }} ({{ clientShare.aiPct }}%)</span>
            <span>Humano {{ attendance.clients_human }} ({{ clientShare.humanPct }}%)</span>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-3">
          <article
            v-for="kpi in attendanceTimeKpis"
            :key="kpi.label"
            class="rounded-2xl border border-brand-ink/10 bg-white px-4 py-4"
          >
            <p class="text-[0.7rem] font-medium tracking-wider text-brand-ink/45 uppercase">
              {{ kpi.label }}
            </p>
            <p class="mt-2 text-xl font-semibold text-brand-ink">{{ kpi.value }}</p>
          </article>
        </div>

        <div class="overflow-hidden rounded-2xl border border-brand-ink/10 bg-white">
          <h3 class="border-b border-brand-ink/10 px-4 py-3 text-sm font-semibold text-brand-ink">
            Tempo por canal / atendente
          </h3>
          <table class="w-full text-left text-sm">
            <thead>
              <tr
                class="border-b border-brand-ink/8 text-[0.7rem] tracking-wider text-brand-ink/45 uppercase"
              >
                <th class="px-4 py-2.5 font-medium">Canal / atendente</th>
                <th class="px-4 py-2.5 font-medium">Clientes</th>
                <th class="px-4 py-2.5 font-medium">Tempo</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!attendance.by_user.length">
                <td colspan="3" class="px-4 py-6 text-brand-ink/45">
                  Nenhum atendimento no período.
                </td>
              </tr>
              <tr
                v-for="row in attendance.by_user"
                :key="`${row.mode}-${row.user_id ?? 'none'}-${row.name}`"
                class="border-b border-brand-ink/5"
              >
                <td class="px-4 py-2.5 text-brand-ink">
                  <span class="inline-flex items-center gap-2">
                    <span
                      class="size-2 shrink-0 rounded-full"
                      :class="row.mode === 'ai' ? 'bg-brand-cyan' : 'bg-brand-blue'"
                    />
                    {{ row.name }}
                  </span>
                </td>
                <td class="px-4 py-2.5 text-brand-ink/65">{{ row.clients }}</td>
                <td class="px-4 py-2.5 text-brand-ink/65">
                  {{ formatDurationSeconds(row.total_seconds) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="space-y-4">
        <header class="space-y-1">
          <h2 class="text-base font-semibold text-brand-ink">CRM</h2>
          <p class="text-sm text-brand-ink/50">
            Contatos, funil de leads e negócios
          </p>
        </header>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article
            v-for="kpi in crmKpis"
            :key="kpi.label"
            class="rounded-2xl border border-brand-ink/10 bg-white px-4 py-4"
          >
            <p class="text-[0.7rem] font-medium tracking-wider text-brand-ink/45 uppercase">
              {{ kpi.label }}
            </p>
            <p class="mt-2 text-xl font-semibold text-brand-ink">{{ kpi.value }}</p>
          </article>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <section class="rounded-2xl border border-brand-ink/10 bg-white p-4">
            <h3 class="text-sm font-semibold text-brand-ink">Leads por dia (30d)</h3>
            <div class="mt-3 h-56">
              <canvas ref="chartCanvas" />
            </div>
          </section>

          <section class="rounded-2xl border border-brand-ink/10 bg-white p-4">
            <h3 class="text-sm font-semibold text-brand-ink">Negócios por estágio</h3>
            <div class="mt-3 h-56">
              <canvas ref="barCanvas" />
            </div>
          </section>
        </div>

        <section class="rounded-2xl border border-brand-ink/10 bg-white p-4">
          <h3 class="text-sm font-semibold text-brand-ink">Funil de leads (atual)</h3>
          <p class="mt-1 text-xs text-brand-ink/45">
            Quantidade atual em cada estágio do kanban (não cumulativo).
          </p>
          <div v-if="!funnelSteps.length" class="mt-4 text-sm text-brand-ink/45">
            Nenhum lead no funil ainda.
          </div>
          <ul v-else class="mt-4 space-y-2">
            <li v-for="step in funnelSteps" :key="step.name">
              <div class="mb-1 flex justify-between text-xs text-brand-ink/55">
                <span>{{ step.name }}</span>
                <span>{{ step.count }} · {{ step.pct }}%</span>
              </div>
              <div class="h-2.5 overflow-hidden rounded-full bg-brand-ink/5">
                <div
                  class="h-full rounded-full transition-all"
                  :style="{ width: `${step.pct}%`, background: step.color }"
                />
              </div>
            </li>
          </ul>
        </section>
      </section>
    </template>
  </div>
</template>
