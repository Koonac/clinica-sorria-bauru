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
import { formatMoney, isTerminalStage, type LeadsPorDiaPoint, type PipelineStage } from '@/api/crm/types'

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
}>()

const chartCanvas = ref<HTMLCanvasElement | null>(null)
const barCanvas = ref<HTMLCanvasElement | null>(null)
let lineChart: Chart | null = null
let barChart: Chart | null = null

const totalLeadsPipeline = computed(() =>
  props.leadStages.reduce((s, st) => s + (st.leads?.length || 0), 0),
)
const totalLeads = computed(() => totalLeadsPipeline.value + props.convertedTotal)

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

const kpis = computed(() => [
  { label: 'Contatos', value: String(props.contactTotal) },
  { label: 'Leads', value: String(totalLeads.value) },
  { label: 'Negócios abertos', value: String(abertos.value.length) },
  { label: 'Valor do pipeline', value: formatMoney(valorPipeline.value) },
  {
    label: 'Ganhos',
    value: `${ganhos.value.length} · ${formatMoney(valorGanhos.value)}`,
  },
  { label: 'Perdidos', value: String(perdidos.value.length) },
])

const funnelSteps = computed(() => {
  const stages = props.leadStages.filter((s) => !s.is_lost)
  const counts = stages.map((s) => s.leads?.length || 0)
  const cumulative: number[] = []
  let running = props.convertedTotal
  for (let i = counts.length - 1; i >= 0; i -= 1) {
    running += counts[i] || 0
    cumulative[i] = running
  }
  const max = Math.max(1, cumulative[0] || totalLeads.value || 1)
  return stages.map((s, i) => ({
    name: s.name,
    count: cumulative[i] || 0,
    pct: Math.round(((cumulative[i] || 0) / max) * 100),
    color: s.color || '#0708f8',
  }))
})

function stageDealSum(stage: PipelineStage): number {
  return (stage.deals || []).reduce((s, d) => s + (Number(d.value) || 0), 0)
}

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
  <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
    <p v-if="error" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </p>

    <div v-if="loading" class="py-16 text-center text-sm text-brand-ink/50">
      Carregando dashboard…
    </div>

    <template v-else>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="kpi in kpis"
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

      <div class="grid gap-4 lg:grid-cols-2">
        <section class="rounded-2xl border border-brand-ink/10 bg-white p-4">
          <h3 class="text-sm font-semibold text-brand-ink">Funil de leads</h3>
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

        <section class="overflow-hidden rounded-2xl border border-brand-ink/10 bg-white">
          <h3 class="border-b border-brand-ink/10 px-4 py-3 text-sm font-semibold text-brand-ink">
            Valor por estágio
          </h3>
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-brand-ink/8 text-[0.7rem] tracking-wider text-brand-ink/45 uppercase">
                <th class="px-4 py-2.5 font-medium">Estágio</th>
                <th class="px-4 py-2.5 font-medium">Negócios</th>
                <th class="px-4 py-2.5 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!dealStages.length">
                <td colspan="3" class="px-4 py-6 text-brand-ink/45">Nenhum estágio.</td>
              </tr>
              <tr
                v-for="st in dealStages"
                :key="st.id"
                class="border-b border-brand-ink/5"
              >
                <td class="px-4 py-2.5">
                  <span class="inline-flex items-center gap-2">
                    <span
                      class="size-2 rounded-full"
                      :style="{ background: st.color || '#6b7280' }"
                    />
                    {{ st.name }}
                  </span>
                </td>
                <td class="px-4 py-2.5 text-brand-ink/65">{{ st.deals?.length || 0 }}</td>
                <td class="px-4 py-2.5 text-brand-ink/65">{{ formatMoney(stageDealSum(st)) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </template>
  </div>
</template>
