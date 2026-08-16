<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import type { TokenUsageStats } from '@/api/dev'
import ContentSkeleton from '@/components/Feedback/ContentSkeleton.vue'

Chart.register(
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Filler,
  Legend,
)

const props = defineProps<{
  loading: boolean
  error: string
  stats: TokenUsageStats | null
}>()

const chartCanvas = ref<HTMLCanvasElement | null>(null)
let lineChart: Chart | null = null

const kpis = computed(() => {
  const t = props.stats?.totals
  if (!t) return []
  return [
    { label: 'Gasto (USD)', value: formatUsd(t.cost) },
    { label: 'Total de tokens', value: formatNumber(t.total_tokens) },
    { label: 'Prompt', value: formatNumber(t.prompt_tokens) },
    { label: 'Completion', value: formatNumber(t.completion_tokens) },
    { label: 'Chamadas', value: formatNumber(t.calls) },
  ]
})

function formatNumber(n: number) {
  return new Intl.NumberFormat('pt-BR').format(n)
}

function formatUsd(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(n || 0)
}

function purposeLabel(purpose: string) {
  const map: Record<string, string> = {
    agent_chat: 'Agent WhatsApp',
    attendance_summary: 'Anotações IA',
    campaign: 'Campanhas',
    media_transcription: 'Transcrição de áudio',
    media_vision: 'Leitura de imagem',
    other: 'Outro',
  }
  return map[purpose] ?? purpose
}

function destroyChart() {
  lineChart?.destroy()
  lineChart = null
}

async function renderChart() {
  await nextTick()
  destroyChart()
  if (!chartCanvas.value || !props.stats) return

  const labels = props.stats.by_day.map((d) => d.date.slice(5))
  const totals = props.stats.by_day.map((d) => d.total_tokens)
  const costs = props.stats.by_day.map((d) => d.cost)

  lineChart = new Chart(chartCanvas.value, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Tokens / dia',
          data: totals,
          borderColor: '#0708f8',
          backgroundColor: 'rgba(7, 8, 248, 0.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 2,
          yAxisID: 'y',
        },
        {
          label: 'Gasto USD / dia',
          data: costs,
          borderColor: '#00e1ff',
          backgroundColor: 'rgba(0, 225, 255, 0.08)',
          fill: false,
          tension: 0.35,
          pointRadius: 2,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'bottom' },
        tooltip: {
          callbacks: {
            label(ctx) {
              const value = Number(ctx.parsed.y ?? 0)
              if (ctx.dataset.yAxisID === 'y1') {
                return `${ctx.dataset.label}: ${formatUsd(value)}`
              }
              return `${ctx.dataset.label}: ${formatNumber(value)}`
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, autoSkipPadding: 12 },
        },
        y: {
          beginAtZero: true,
          position: 'left',
          ticks: {
            callback: (v) => formatNumber(Number(v)),
          },
        },
        y1: {
          beginAtZero: true,
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: {
            callback: (v) => formatUsd(Number(v)),
          },
        },
      },
    },
  })
}

watch(
  () => [props.loading, props.stats] as const,
  ([loading]) => {
    if (!loading && props.stats) void renderChart()
  },
  { immediate: true },
)

onBeforeUnmount(() => destroyChart())
</script>

<template>
  <ContentSkeleton v-if="loading" variant="dashboard" />

  <div v-else-if="error" class="rounded-2xl border border-brand-ink/10 bg-white px-4 py-3 text-sm text-brand-ink">
    {{ error }}
  </div>

  <div v-else-if="stats" class="flex flex-col gap-4">
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div
        v-for="kpi in kpis"
        :key="kpi.label"
        class="rounded-2xl border border-brand-ink/10 bg-white px-4 py-4"
      >
        <p class="text-[0.65rem] font-medium tracking-[0.18em] text-brand-ink/45 uppercase">
          {{ kpi.label }}
        </p>
        <p class="mt-2 text-2xl font-semibold text-brand-ink">{{ kpi.value }}</p>
      </div>
    </div>

    <div class="rounded-2xl border border-brand-ink/10 bg-white p-4">
      <p class="mb-3 text-[0.65rem] font-medium tracking-[0.18em] text-brand-ink/45 uppercase">
        Consumo diário ({{ stats.dias }} dias)
      </p>
      <div class="h-64">
        <canvas ref="chartCanvas" />
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div class="overflow-hidden rounded-2xl border border-brand-ink/10 bg-white">
        <p class="border-b border-brand-ink/5 px-4 py-3 text-[0.65rem] font-medium tracking-[0.18em] text-brand-ink/45 uppercase">
          Por finalidade
        </p>
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead class="bg-brand-ink/[0.02] text-brand-ink/55">
              <tr>
                <th class="px-4 py-2 font-medium">Finalidade</th>
                <th class="px-4 py-2 font-medium">Tokens</th>
                <th class="px-4 py-2 font-medium">Gasto</th>
                <th class="px-4 py-2 font-medium">Chamadas</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in stats.by_purpose"
                :key="row.purpose"
                class="border-t border-brand-ink/5"
              >
                <td class="px-4 py-2.5">{{ purposeLabel(row.purpose || '') }}</td>
                <td class="px-4 py-2.5">{{ formatNumber(row.total_tokens) }}</td>
                <td class="px-4 py-2.5">{{ formatUsd(row.cost) }}</td>
                <td class="px-4 py-2.5">{{ formatNumber(row.calls) }}</td>
              </tr>
              <tr v-if="!stats.by_purpose.length">
                <td colspan="4" class="px-4 py-6 text-center text-brand-ink/50">
                  Sem uso registrado no período.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="overflow-hidden rounded-2xl border border-brand-ink/10 bg-white">
        <p class="border-b border-brand-ink/5 px-4 py-3 text-[0.65rem] font-medium tracking-[0.18em] text-brand-ink/45 uppercase">
          Por modelo
        </p>
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead class="bg-brand-ink/[0.02] text-brand-ink/55">
              <tr>
                <th class="px-4 py-2 font-medium">Modelo</th>
                <th class="px-4 py-2 font-medium">Tokens</th>
                <th class="px-4 py-2 font-medium">Gasto</th>
                <th class="px-4 py-2 font-medium">Chamadas</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in stats.by_model"
                :key="row.model"
                class="border-t border-brand-ink/5"
              >
                <td class="px-4 py-2.5 font-mono text-xs">{{ row.model }}</td>
                <td class="px-4 py-2.5">{{ formatNumber(row.total_tokens) }}</td>
                <td class="px-4 py-2.5">{{ formatUsd(row.cost) }}</td>
                <td class="px-4 py-2.5">{{ formatNumber(row.calls) }}</td>
              </tr>
              <tr v-if="!stats.by_model.length">
                <td colspan="4" class="px-4 py-6 text-center text-brand-ink/50">
                  Sem uso registrado no período.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
