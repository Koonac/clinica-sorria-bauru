<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '@/api/client'
import {
  disconnectWhatsapp,
  getConnection,
  getConnectionStatus,
  updateConnectionSettings,
  type ClinicConnection,
} from '@/api/crm/connection'
import { listStages } from '@/api/crm/pipeline'
import type { PipelineStage } from '@/api/crm/types'
import Button from '@/components/Buttons/Button.vue'
import Skeleton from '@/components/Feedback/Skeleton.vue'
import Select from '@/components/Forms/Select.vue'
import Slider from '@/components/Forms/Slider.vue'
import { useClinicsStore } from '@/stores/clinics'

const clinics = useClinicsStore()

const connection = ref<ClinicConnection | null>(null)
const leadStages = ref<PipelineStage[]>([])
const loading = ref(true)
const actionLoading = ref(false)
const statusLoading = ref(false)
const errorMessage = ref('')
const flash = ref('')

const settings = ref({
  name: '',
  ai_display_name: '',
  default_lead_stage_id: '' as string | number,
  whatsapp_agent_auto_resume_hours: 24,
  whatsapp_attendance_auto_close_minutes: 10,
  whatsapp_finalize_notice: '_finalizando chamado_',
  whatsapp_agent_history_limit: 40,
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
  settings.value.name = next.name ?? ''
  settings.value.ai_display_name = next.ai_display_name ?? ''
  settings.value.default_lead_stage_id = next.default_lead_stage_id
    ? String(next.default_lead_stage_id)
    : ''
  settings.value.whatsapp_agent_auto_resume_hours =
    next.whatsapp_agent_auto_resume_hours ?? 24
  settings.value.whatsapp_attendance_auto_close_minutes =
    next.whatsapp_attendance_auto_close_minutes ?? 10
  settings.value.whatsapp_finalize_notice =
    next.whatsapp_finalize_notice ?? '_finalizando chamado_'
  settings.value.whatsapp_agent_history_limit = next.whatsapp_agent_history_limit ?? 40
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

async function saveSettings() {
  if (actionLoading.value) return
  actionLoading.value = true
  errorMessage.value = ''
  flash.value = ''
  try {
    const stageId = settings.value.default_lead_stage_id
    const next = await updateConnectionSettings({
      name: settings.value.name.trim() || null,
      ai_display_name: settings.value.ai_display_name.trim() || null,
      default_lead_stage_id: stageId === '' ? null : Number(stageId),
      whatsapp_agent_auto_resume_hours: Number(settings.value.whatsapp_agent_auto_resume_hours),
      whatsapp_attendance_auto_close_minutes: Number(
        settings.value.whatsapp_attendance_auto_close_minutes,
      ),
      whatsapp_finalize_notice: settings.value.whatsapp_finalize_notice.trim(),
      whatsapp_agent_history_limit: Number(settings.value.whatsapp_agent_history_limit),
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
          Opções da conexão WhatsApp da clínica
          <strong class="font-medium text-brand-ink">{{ clinicName }}</strong>.
          <span v-if="connection?.phone" class="block mt-0.5 text-brand-ink/55">
            Número: {{ connection.phone }}
          </span>
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
      <Skeleton class="h-5 w-36 rounded-md" />
      <div class="grid gap-3 sm:grid-cols-2">
        <Skeleton class="h-12 w-full rounded-xl" />
        <Skeleton class="h-12 w-full rounded-xl" />
      </div>
      <Skeleton class="h-12 w-full rounded-xl sm:col-span-2" />
      <Skeleton class="h-11 w-44 rounded-full" />
    </div>

    <template v-else>
      <form class="flex flex-col gap-3" @submit.prevent="saveSettings">
        <h4 class="text-base font-semibold tracking-tight text-brand-ink">Configurações</h4>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Nome da conexão</span>
            <input v-model="settings.name" type="text" maxlength="120" :class="inputClass" />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Nome da IA</span>
            <input
              v-model="settings.ai_display_name"
              type="text"
              maxlength="120"
              placeholder="Ex.: Assistente Sorria"
              :class="inputClass"
            />
            <span class="text-xs text-brand-ink/45">
              Aparece no início das mensagens enviadas pelo Agent IA.
            </span>
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Estágio padrão do lead</span>
            <Select v-model="settings.default_lead_stage_id" :options="stageOptions" />
          </label>
          <label class="flex flex-col gap-1.5 sm:col-span-2">
            <span class="text-sm font-medium text-brand-ink/80">
              Horas para a IA retomar após resposta humana
            </span>
            <input
              v-model.number="settings.whatsapp_agent_auto_resume_hours"
              type="number"
              min="1"
              max="168"
              required
              :class="inputClass"
            />
            <span class="text-xs text-brand-ink/45">
              Quando um atendente responde pelo WhatsApp (plataforma ou celular), a IA fica pausada
              por este período e retoma automaticamente. Pausar pelo botão permanece até retomada
              manual. (1–168 horas)
            </span>
          </label>
          <label class="flex flex-col gap-1.5 sm:col-span-2">
            <span class="text-sm font-medium text-brand-ink/80">
              Minutos sem resposta do cliente para fechar atendimento
            </span>
            <input
              v-model.number="settings.whatsapp_attendance_auto_close_minutes"
              type="number"
              min="1"
              max="1440"
              required
              :class="inputClass"
            />
            <span class="text-xs text-brand-ink/45">
              Após uma mensagem nossa (IA ou humano), se o cliente não responder neste prazo, o
              atendimento é finalizado automaticamente. (1–1440 minutos; padrão 10)
            </span>
          </label>
          <label class="flex flex-col gap-2 sm:col-span-2">
            <span class="flex items-center justify-between gap-2 text-sm font-medium text-brand-ink/80">
              Mensagens de contexto da IA
              <span class="tabular-nums text-brand-ink">{{ settings.whatsapp_agent_history_limit }}</span>
            </span>
            <Slider
              v-model="settings.whatsapp_agent_history_limit"
              :min="5"
              :max="100"
              :step="1"
              aria-label="Mensagens de contexto da IA"
            />
            <span class="flex justify-between text-[11px] text-brand-ink/40 tabular-nums">
              <span>5</span>
              <span>100</span>
            </span>
            <span class="text-xs text-brand-ink/45">
              Quantas mensagens do atendimento atual a IA lê ao responder (5–100; padrão 40).
            </span>
          </label>
          <label class="flex flex-col gap-1.5 sm:col-span-2">
            <span class="text-sm font-medium text-brand-ink/80">
              Mensagem ao finalizar chamado
            </span>
            <textarea
              v-model="settings.whatsapp_finalize_notice"
              rows="2"
              maxlength="500"
              placeholder="_finalizando chamado_"
              :class="inputClass"
            />
            <span class="text-xs text-brand-ink/45">
              Enviada automaticamente ao cliente quando o atendimento é finalizado (IA ou
              atendente). Deixe vazio para não enviar aviso.
            </span>
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
