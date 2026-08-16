<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { ApiError } from '@/api/client'
import {
  getOutboundHttpLog,
  listOutboundHttpLogs,
  type OutboundHttpLogDetail,
  type OutboundHttpLogListItem,
} from '@/api/dev'
import Button from '@/components/Buttons/Button.vue'
import ContentSkeleton from '@/components/Feedback/ContentSkeleton.vue'
import Select from '@/components/Forms/Select.vue'

const loading = ref(true)
const error = ref('')
const logs = ref<OutboundHttpLogListItem[]>([])
const page = ref(1)
const lastPage = ref(1)
const total = ref(0)

const filters = reactive({
  provider: '' as string,
  status: '' as string,
  search: '',
})

const detailOpen = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const detail = ref<OutboundHttpLogDetail | null>(null)

const providerOptions = [
  { value: '', label: 'Todos os providers' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'google', label: 'Google' },
  { value: 'other', label: 'Other' },
]

const statusOptions = [
  { value: '', label: 'Qualquer status' },
  { value: '200', label: '200' },
  { value: '400', label: '400' },
  { value: '401', label: '401' },
  { value: '403', label: '403' },
  { value: '422', label: '422' },
  { value: '500', label: '500' },
]

async function loadLogs(resetPage = false) {
  if (resetPage) page.value = 1
  loading.value = true
  error.value = ''
  try {
    const result = await listOutboundHttpLogs({
      provider: filters.provider || undefined,
      status: filters.status ? Number(filters.status) : undefined,
      search: filters.search.trim() || undefined,
      page: page.value,
      per_page: 50,
    })
    logs.value = result.data
    lastPage.value = result.last_page
    total.value = result.total
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Não foi possível carregar os logs.'
    logs.value = []
  } finally {
    loading.value = false
  }
}

async function openDetail(id: number) {
  detailOpen.value = true
  detailLoading.value = true
  detailError.value = ''
  detail.value = null
  try {
    detail.value = await getOutboundHttpLog(id)
  } catch (e) {
    detailError.value =
      e instanceof ApiError ? e.message : 'Não foi possível carregar o detalhe.'
  } finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  detailOpen.value = false
  detail.value = null
}

function formatDate(value: string | null) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(value))
  } catch {
    return value
  }
}

watch(
  () => [filters.provider, filters.status] as const,
  () => {
    void loadLogs(true)
  },
)

onMounted(() => {
  void loadLogs()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-end gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4">
      <label class="flex min-w-[10rem] flex-1 flex-col gap-1.5">
        <span class="text-xs font-medium text-brand-ink/60">Provider</span>
        <Select v-model="filters.provider" :options="providerOptions" />
      </label>
      <label class="flex min-w-[8rem] flex-1 flex-col gap-1.5">
        <span class="text-xs font-medium text-brand-ink/60">Status</span>
        <Select v-model="filters.status" :options="statusOptions" />
      </label>
      <label class="flex min-w-[14rem] flex-[2] flex-col gap-1.5">
        <span class="text-xs font-medium text-brand-ink/60">Buscar URL / erro</span>
        <input
          v-model="filters.search"
          type="search"
          class="w-full rounded-xl border border-brand-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
          placeholder="openrouter, whatsapp…"
          @keydown.enter.prevent="loadLogs(true)"
        />
      </label>
      <Button variant="secondary" icon="lucide:search" @click="loadLogs(true)">Filtrar</Button>
    </div>

    <ContentSkeleton v-if="loading" variant="table" :rows="8" />

    <div
      v-else-if="error"
      class="rounded-2xl border border-brand-ink/10 bg-white px-4 py-3 text-sm text-brand-ink"
    >
      {{ error }}
    </div>

    <div v-else class="overflow-hidden rounded-2xl border border-brand-ink/10 bg-white">
      <div class="flex items-center justify-between border-b border-brand-ink/5 px-4 py-3">
        <p class="text-sm text-brand-ink/60">{{ total }} registro(s)</p>
        <div class="flex items-center gap-2">
          <Button
            variant="secondary"
            :disabled="page <= 1"
            @click="page -= 1; loadLogs()"
          >
            Anterior
          </Button>
          <span class="text-xs text-brand-ink/50">{{ page }} / {{ lastPage }}</span>
          <Button
            variant="secondary"
            :disabled="page >= lastPage"
            @click="page += 1; loadLogs()"
          >
            Próxima
          </Button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="bg-brand-ink/[0.02] text-brand-ink/55">
            <tr>
              <th class="px-4 py-2 font-medium">Quando</th>
              <th class="px-4 py-2 font-medium">Provider</th>
              <th class="px-4 py-2 font-medium">Método</th>
              <th class="px-4 py-2 font-medium">Status</th>
              <th class="px-4 py-2 font-medium">ms</th>
              <th class="px-4 py-2 font-medium">URL</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="log in logs"
              :key="log.id"
              class="cursor-pointer border-t border-brand-ink/5 transition hover:bg-brand-ink/[0.02]"
              @click="openDetail(log.id)"
            >
              <td class="whitespace-nowrap px-4 py-2.5 text-brand-ink/70">
                {{ formatDate(log.created_at) }}
              </td>
              <td class="px-4 py-2.5">{{ log.provider }}</td>
              <td class="px-4 py-2.5 font-mono text-xs">{{ log.method }}</td>
              <td class="px-4 py-2.5">
                <span
                  class="inline-flex rounded-lg px-2 py-0.5 text-xs font-medium"
                  :class="
                    (log.response_status ?? 0) >= 400
                      ? 'bg-red-500/10 text-red-700'
                      : 'bg-brand-blue/10 text-brand-blue'
                  "
                >
                  {{ log.response_status ?? '—' }}
                </span>
              </td>
              <td class="px-4 py-2.5 text-brand-ink/70">{{ log.duration_ms ?? '—' }}</td>
              <td class="max-w-md truncate px-4 py-2.5 font-mono text-xs text-brand-ink/70">
                {{ log.url }}
              </td>
            </tr>
            <tr v-if="!logs.length">
              <td colspan="6" class="px-4 py-8 text-center text-brand-ink/50">
                Nenhum log encontrado.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="detailOpen"
        class="fixed inset-0 z-50 flex items-end justify-center bg-brand-ink/40 p-4 sm:items-center"
        @click.self="closeDetail"
      >
        <div
          class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-brand-ink/10 bg-white shadow-xl"
        >
          <div class="sticky top-0 flex items-center justify-between border-b border-brand-ink/10 bg-white px-5 py-4">
            <h2 class="text-sm font-semibold tracking-wide text-brand-ink uppercase">
              Detalhe do log
            </h2>
            <button
              type="button"
              class="cursor-pointer rounded-lg px-2 py-1 text-sm text-brand-ink/60 hover:bg-brand-ink/5"
              @click="closeDetail"
            >
              Fechar
            </button>
          </div>

          <div class="space-y-4 p-5">
            <p v-if="detailLoading" class="text-sm text-brand-ink/60">Carregando…</p>
            <p v-else-if="detailError" class="text-sm text-brand-ink">{{ detailError }}</p>
            <template v-else-if="detail">
              <dl class="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt class="text-xs text-brand-ink/50">Quando</dt>
                  <dd class="text-sm">{{ formatDate(detail.created_at) }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-brand-ink/50">Provider</dt>
                  <dd class="text-sm">{{ detail.provider }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-brand-ink/50">Método / Status</dt>
                  <dd class="text-sm">{{ detail.method }} · {{ detail.response_status ?? '—' }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-brand-ink/50">Duração</dt>
                  <dd class="text-sm">{{ detail.duration_ms ?? '—' }} ms</dd>
                </div>
                <div class="sm:col-span-2">
                  <dt class="text-xs text-brand-ink/50">URL</dt>
                  <dd class="break-all font-mono text-xs">{{ detail.url }}</dd>
                </div>
                <div v-if="detail.error" class="sm:col-span-2">
                  <dt class="text-xs text-brand-ink/50">Erro</dt>
                  <dd class="text-sm text-red-700">{{ detail.error }}</dd>
                </div>
              </dl>

              <div>
                <p class="mb-1 text-xs font-medium text-brand-ink/50 uppercase">Request body</p>
                <pre class="max-h-48 overflow-auto rounded-xl bg-brand-ink/[0.04] p-3 text-xs whitespace-pre-wrap">{{ detail.request_body || '—' }}</pre>
              </div>
              <div>
                <p class="mb-1 text-xs font-medium text-brand-ink/50 uppercase">Response body</p>
                <pre class="max-h-64 overflow-auto rounded-xl bg-brand-ink/[0.04] p-3 text-xs whitespace-pre-wrap">{{ detail.response_body || '—' }}</pre>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
