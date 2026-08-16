<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ApiError } from '@/api/client'
import {
  connectWhatsapp,
  disconnectWhatsapp,
  getConnection,
  getConnectionQr,
  getConnectionStatus,
  type ClinicConnection,
  type ConnectionStatus,
} from '@/api/crm/connection'
import Button from '@/components/Buttons/Button.vue'
import ContentSkeleton from '@/components/Feedback/ContentSkeleton.vue'
import { useAuthStore } from '@/stores/auth'
import { useClinicsStore } from '@/stores/clinics'

const emit = defineEmits<{
  'status-change': [status: ConnectionStatus]
}>()

const auth = useAuthStore()
const clinics = useClinicsStore()
const canManageConnection = computed(() => auth.isAdmin)

const connection = ref<ClinicConnection | null>(null)
const loading = ref(true)
const actionLoading = ref(false)
const errorMessage = ref('')
const flash = ref('')
const qrDataUrl = ref<string | null>(null)
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)

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

const clinicName = computed(() => clinics.activeClinic?.name ?? 'Clínica ativa')

function stopPolling() {
  if (pollTimer.value) {
    clearInterval(pollTimer.value)
    pollTimer.value = null
  }
}

function applyConnection(next: ClinicConnection) {
  connection.value = next
  emit('status-change', next.status)
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
    const conn = await getConnection()
    applyConnection(conn)
    if (canManageConnection.value && conn.status === 'connecting') {
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

async function onConnect() {
  if (!canManageConnection.value || actionLoading.value) return
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
  if (!canManageConnection.value || actionLoading.value) return
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
  <div class="min-h-0 flex-1 overflow-y-auto">
    <p class="mb-3 text-sm text-brand-ink/55">
      Conexão da clínica <strong class="font-medium text-brand-ink">{{ clinicName }}</strong>
    </p>

    <p
      v-if="flash"
      class="mb-3 rounded-xl border border-brand-cyan/35 bg-brand-cyan/10 px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
      role="status"
    >
      {{ flash }}
    </p>
    <p
      v-if="errorMessage"
      class="mb-3 rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <ContentSkeleton v-if="loading" variant="cards" />

    <section
      v-else
      class="flex max-w-xl flex-col gap-4 rounded-2xl border border-brand-ink/10 bg-white p-5"
    >
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

      <div v-if="canManageConnection" class="flex flex-wrap gap-2">
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

      <p v-else class="text-sm text-brand-ink/55">
        Apenas administradores podem gerenciar a conexão do WhatsApp.
      </p>

      <p
        v-if="canManageConnection && !connection?.has_credentials"
        class="text-sm text-brand-ink/55"
      >
        <template v-if="auth.isDeveloper">
          Configure as credenciais da API em
          <strong class="font-medium text-brand-ink">Dev → Configuração</strong>
          antes de conectar.
        </template>
        <template v-else>
          As credenciais da API ainda não foram configuradas. Peça a um developer para
          defini-las em
          <strong class="font-medium text-brand-ink">Dev → Configuração</strong>.
        </template>
      </p>

      <div
        v-if="canManageConnection && qrDataUrl && connection?.status === 'connecting'"
        class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-brand-ink/15 bg-[#f4f6f8] p-4"
      >
        <p class="text-sm text-brand-ink/65">Escaneie o QR Code no WhatsApp do celular</p>
        <img :src="qrDataUrl" alt="QR Code WhatsApp" class="size-56 rounded-xl bg-white p-2" />
      </div>
    </section>
  </div>
</template>
