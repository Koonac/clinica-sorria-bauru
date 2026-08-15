<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import {
  connectWhatsapp,
  disconnectWhatsapp,
  getConnection,
  getConnectionQr,
  getConnectionStatus,
  updateConnectionCredentials,
  updateConnectionSettings,
  type ClinicConnection,
} from '@/api/crm/connection'
import { listStages } from '@/api/crm/pipeline'
import type { PipelineStage } from '@/api/crm/types'
import Button from '@/components/Buttons/Button.vue'
import PageView from '@/components/Layout/PageView.vue'
import Select from '@/components/Forms/Select.vue'
import { useClinicsStore } from '@/stores/clinics'

const clinics = useClinicsStore()

const connection = ref<ClinicConnection | null>(null)
const leadStages = ref<PipelineStage[]>([])
const loading = ref(true)
const actionLoading = ref(false)
const errorMessage = ref('')
const flash = ref('')
const qrDataUrl = ref<string | null>(null)
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)

const credentials = ref({
  api_username: '',
  api_password: '',
})

const settings = ref({
  name: '',
  default_lead_stage_id: '' as string | number,
})

const inputClass =
  'w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25'

const statusLabel = computed(() => {
  switch (connection.value?.status) {
    case 'connected':
      return 'Conectado'
    case 'connecting':
      return 'Conectando…'
    case 'error':
      return 'Erro'
    default:
      return 'Desconectado'
  }
})

const statusTone = computed(() => {
  switch (connection.value?.status) {
    case 'connected':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800'
    case 'connecting':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-900'
    case 'error':
      return 'border-red-500/30 bg-red-500/10 text-red-800'
    default:
      return 'border-brand-ink/15 bg-brand-ink/[0.04] text-brand-ink/70'
  }
})

const stageOptions = computed(() => [
  { value: '', label: 'Padrão do sistema' },
  ...leadStages.value.map((s) => ({ value: String(s.id), label: s.name })),
])

const clinicName = computed(() => clinics.activeClinic?.name ?? 'Clínica ativa')

function stopPolling() {
  if (pollTimer.value) {
    clearInterval(pollTimer.value)
    pollTimer.value = null
  }
}

function applyConnection(next: ClinicConnection) {
  connection.value = next
  credentials.value.api_username = next.api_username ?? ''
  settings.value.name = next.name ?? ''
  settings.value.default_lead_stage_id = next.default_lead_stage_id
    ? String(next.default_lead_stage_id)
    : ''
}

async function refreshStatus() {
  const next = await getConnectionStatus()
  applyConnection(next)
  if (next.status === 'connected') {
    qrDataUrl.value = null
    stopPolling()
  }
}

async function refreshQr() {
  try {
    const qr = await getConnectionQr()
    if (qr.qr) {
      qrDataUrl.value = qr.qr.startsWith('data:') ? qr.qr : `data:image/png;base64,${qr.qr}`
    }
  } catch {
    // QR ainda pode não existir
  }
}

function startPolling() {
  stopPolling()
  pollTimer.value = setInterval(() => {
    void (async () => {
      try {
        await refreshStatus()
        if (connection.value?.status === 'connecting') {
          await refreshQr()
        }
      } catch {
        // ignora falhas transitórias no poll
      }
    })()
  }, 2500)
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [conn, stages] = await Promise.all([getConnection(), listStages('lead')])
    applyConnection(conn)
    leadStages.value = stages
    if (conn.status === 'connecting') {
      await refreshQr()
      startPolling()
    }
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError
        ? error.message || 'Não foi possível carregar a conexão WhatsApp.'
        : 'Servidor indisponível. Tente novamente.'
  } finally {
    loading.value = false
  }
}

async function saveCredentials() {
  if (actionLoading.value) return
  actionLoading.value = true
  errorMessage.value = ''
  flash.value = ''
  try {
    const next = await updateConnectionCredentials({
      api_username: credentials.value.api_username.trim(),
      api_password: credentials.value.api_password,
    })
    applyConnection(next)
    credentials.value.api_password = ''
    flash.value = 'Credenciais salvas.'
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError ? error.message : 'Não foi possível salvar as credenciais.'
  } finally {
    actionLoading.value = false
  }
}

async function saveSettings() {
  if (actionLoading.value) return
  actionLoading.value = true
  errorMessage.value = ''
  flash.value = ''
  try {
    const stageId = settings.value.default_lead_stage_id
    const next = await updateConnectionSettings({
      name: settings.value.name.trim() || null,
      default_lead_stage_id: stageId === '' ? null : Number(stageId),
    })
    applyConnection(next)
    flash.value = 'Configurações salvas.'
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError ? error.message : 'Não foi possível salvar as configurações.'
  } finally {
    actionLoading.value = false
  }
}

async function onConnect() {
  if (actionLoading.value) return
  actionLoading.value = true
  errorMessage.value = ''
  flash.value = ''
  try {
    const result = await connectWhatsapp()
    applyConnection(result.data)
    flash.value = result.message || 'Conexão iniciada. Escaneie o QR Code.'
    await refreshQr()
    startPolling()
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError ? error.message : 'Não foi possível conectar o WhatsApp.'
  } finally {
    actionLoading.value = false
  }
}

async function onDisconnect() {
  if (actionLoading.value) return
  actionLoading.value = true
  errorMessage.value = ''
  flash.value = ''
  try {
    const next = await disconnectWhatsapp()
    applyConnection(next)
    qrDataUrl.value = null
    stopPolling()
    flash.value = 'WhatsApp desconectado.'
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError ? error.message : 'Não foi possível desconectar.'
  } finally {
    actionLoading.value = false
  }
}

watch(
  () => clinics.activeClinicId,
  () => {
    stopPolling()
    void load()
  },
)

onMounted(() => {
  void load()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <PageView title="WhatsApp">
    <p class="shrink-0 text-sm text-brand-ink/55">
      Conexão da clínica <strong class="font-medium text-brand-ink">{{ clinicName }}</strong>
    </p>

    <p
      v-if="flash"
      class="shrink-0 rounded-xl border border-brand-cyan/35 bg-brand-cyan/10 px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
      role="status"
    >
      {{ flash }}
    </p>
    <p
      v-if="errorMessage"
      class="shrink-0 rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <div v-if="loading" class="text-sm text-brand-ink/55">Carregando conexão…</div>

    <div v-else class="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-2">
      <section class="flex flex-col gap-4 rounded-2xl border border-brand-ink/10 bg-white p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold tracking-tight">Status</h2>
            <p class="mt-1 text-sm text-brand-ink/55">
              {{ connection?.phone ? `Número: ${connection.phone}` : 'Nenhum número vinculado' }}
            </p>
          </div>
          <span
            class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide uppercase"
            :class="statusTone"
          >
            {{ statusLabel }}
          </span>
        </div>

        <div class="flex flex-wrap gap-2">
          <Button
            :disabled="actionLoading || !connection?.has_credentials"
            icon="lucide:qr-code"
            @click="onConnect"
          >
            Conectar
          </Button>
          <Button
            variant="secondary"
            :disabled="actionLoading || connection?.status === 'disconnected'"
            icon="lucide:unplug"
            @click="onDisconnect"
          >
            Desconectar
          </Button>
        </div>

        <div
          v-if="qrDataUrl && connection?.status === 'connecting'"
          class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-brand-ink/15 bg-[#f4f6f8] p-4"
        >
          <p class="text-sm text-brand-ink/65">Escaneie o QR Code no WhatsApp do celular</p>
          <img :src="qrDataUrl" alt="QR Code WhatsApp" class="size-56 rounded-xl bg-white p-2" />
        </div>
      </section>

      <section class="flex flex-col gap-5 rounded-2xl border border-brand-ink/10 bg-white p-5">
        <form class="flex flex-col gap-3" @submit.prevent="saveCredentials">
          <h2 class="text-lg font-semibold tracking-tight">Credenciais da API</h2>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Usuário</span>
            <input
              v-model="credentials.api_username"
              type="text"
              autocomplete="off"
              required
              :class="inputClass"
            />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Senha</span>
            <input
              v-model="credentials.api_password"
              type="password"
              autocomplete="new-password"
              required
              :class="inputClass"
              :placeholder="connection?.has_credentials ? '••••••••' : ''"
            />
          </label>
          <div>
            <Button type="submit" :disabled="actionLoading" icon="lucide:save">
              Salvar credenciais
            </Button>
          </div>
        </form>

        <form class="flex flex-col gap-3 border-t border-brand-ink/10 pt-5" @submit.prevent="saveSettings">
          <h2 class="text-lg font-semibold tracking-tight">Configurações</h2>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Nome da conexão</span>
            <input v-model="settings.name" type="text" maxlength="120" :class="inputClass" />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Estágio padrão do lead</span>
            <Select v-model="settings.default_lead_stage_id" :options="stageOptions" />
          </label>
          <div>
            <Button type="submit" :disabled="actionLoading" icon="lucide:sliders-horizontal">
              Salvar configurações
            </Button>
          </div>
        </form>
      </section>
    </div>
  </PageView>
</template>
