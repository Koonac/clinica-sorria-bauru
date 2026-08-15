<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '@/api/client'
import {
  disconnectWhatsapp,
  getConnection,
  getConnectionStatus,
  updateConnectionCredentials,
  updateConnectionSettings,
  type ClinicConnection,
} from '@/api/crm/connection'
import { listStages } from '@/api/crm/pipeline'
import type { PipelineStage } from '@/api/crm/types'
import Button from '@/components/Buttons/Button.vue'
import Skeleton from '@/components/Feedback/Skeleton.vue'
import Select from '@/components/Forms/Select.vue'
import { useClinicsStore } from '@/stores/clinics'

const clinics = useClinicsStore()

const connection = ref<ClinicConnection | null>(null)
const leadStages = ref<PipelineStage[]>([])
const loading = ref(true)
const actionLoading = ref(false)
const statusLoading = ref(false)
const errorMessage = ref('')
const flash = ref('')

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

const stageOptions = computed(() => [
  { value: '', label: 'Padrão do sistema' },
  ...leadStages.value.map((s) => ({ value: String(s.id), label: s.name })),
])

const clinicName = computed(() => clinics.activeClinic?.name ?? 'Clínica ativa')

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

function applyConnection(next: ClinicConnection) {
  connection.value = next
  credentials.value.api_username = next.api_username ?? ''
  settings.value.name = next.name ?? ''
  settings.value.default_lead_stage_id = next.default_lead_stage_id
    ? String(next.default_lead_stage_id)
    : ''
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  flash.value = ''
  try {
    const [conn, stages] = await Promise.all([getConnection(), listStages('lead')])
    applyConnection(conn)
    leadStages.value = stages
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError
        ? error.message || 'Não foi possível carregar as configurações do WhatsApp.'
        : 'Servidor indisponível. Tente novamente.'
  } finally {
    loading.value = false
  }
}

async function verifyStatus() {
  if (statusLoading.value || actionLoading.value) return
  statusLoading.value = true
  errorMessage.value = ''
  flash.value = ''
  try {
    const next = await getConnectionStatus()
    applyConnection(next)
    flash.value = 'Status atualizado.'
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError ? error.message : 'Não foi possível verificar o status.'
  } finally {
    statusLoading.value = false
  }
}

async function onDisconnect() {
  if (statusLoading.value || actionLoading.value) return
  if (connection.value?.status === 'disconnected') return
  statusLoading.value = true
  errorMessage.value = ''
  flash.value = ''
  try {
    const next = await disconnectWhatsapp()
    applyConnection(next)
    flash.value = 'WhatsApp desconectado.'
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError ? error.message : 'Não foi possível desconectar.'
  } finally {
    statusLoading.value = false
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

watch(
  () => clinics.activeClinicId,
  () => {
    void load()
  },
)

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="flex w-full flex-col gap-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-lg font-semibold text-brand-ink">WhatsApp</h3>
        <p class="mt-1 text-sm leading-relaxed text-brand-ink/65">
          Credenciais e opções da conexão WhatsApp da clínica
          <strong class="font-medium text-brand-ink">{{ clinicName }}</strong>.
        </p>
      </div>
      <div
        v-if="!loading"
        class="flex shrink-0 flex-wrap items-center gap-2"
      >
        <span
          class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide uppercase"
          :class="statusTone"
        >
          {{ statusLabel }}
        </span>
        <Button
          variant="secondary"
          size="sm"
          :disabled="statusLoading || actionLoading"
          :loading="statusLoading"
          icon="lucide:refresh-cw"
          @click="verifyStatus"
        >
          Verificar status
        </Button>
        <Button
          v-if="connection?.status && connection.status !== 'disconnected'"
          variant="secondary"
          size="sm"
          :disabled="statusLoading || actionLoading"
          icon="lucide:unplug"
          @click="onDisconnect"
        >
          Desconectar
        </Button>
      </div>
    </div>

    <p
      v-if="flash"
      class="rounded-xl border border-brand-cyan/35 bg-brand-cyan/10 px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
      role="status"
    >
      {{ flash }}
    </p>
    <p
      v-if="errorMessage"
      class="rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <div v-if="loading" class="flex flex-col gap-4" aria-busy="true">
      <Skeleton class="h-5 w-40 rounded-md" />
      <div class="grid gap-3 sm:grid-cols-2">
        <Skeleton class="h-12 w-full rounded-xl" />
        <Skeleton class="h-12 w-full rounded-xl" />
      </div>
      <Skeleton class="h-11 w-44 rounded-full" />
      <Skeleton class="mt-2 h-px w-full rounded-none" />
      <Skeleton class="h-5 w-36 rounded-md" />
      <div class="grid gap-3 sm:grid-cols-2">
        <Skeleton class="h-12 w-full rounded-xl" />
        <Skeleton class="h-12 w-full rounded-xl" />
      </div>
    </div>

    <template v-else>
      <form class="flex flex-col gap-3" @submit.prevent="saveCredentials">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h4 class="text-base font-semibold tracking-tight text-brand-ink">Credenciais da API</h4>
          <p v-if="connection?.phone" class="text-sm text-brand-ink/55">
            Número: {{ connection.phone }}
          </p>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
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
        </div>
        <div>
          <Button type="submit" :disabled="actionLoading || statusLoading" icon="lucide:save">
            Salvar credenciais
          </Button>
        </div>
      </form>

      <form class="flex flex-col gap-3 border-t border-brand-ink/10 pt-5" @submit.prevent="saveSettings">
        <h4 class="text-base font-semibold tracking-tight text-brand-ink">Configurações</h4>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Nome da conexão</span>
            <input v-model="settings.name" type="text" maxlength="120" :class="inputClass" />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Estágio padrão do lead</span>
            <Select v-model="settings.default_lead_stage_id" :options="stageOptions" />
          </label>
        </div>
        <div>
          <Button
            type="submit"
            :disabled="actionLoading || statusLoading"
            icon="lucide:sliders-horizontal"
          >
            Salvar configurações
          </Button>
        </div>
      </form>
    </template>
  </div>
</template>
