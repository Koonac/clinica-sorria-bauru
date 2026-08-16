<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '@/api/client'
import {
  getConnection,
  updateConnectionCredentials,
  type ClinicConnection,
} from '@/api/crm/connection'
import {
  getSystemSettings,
  listOpenRouterModels,
  updateSystemSettings,
  type OpenRouterModelCapability,
  type SystemSettings,
} from '@/api/dev'
import Button from '@/components/Buttons/Button.vue'
import ContentSkeleton from '@/components/Feedback/ContentSkeleton.vue'
import Skeleton from '@/components/Feedback/Skeleton.vue'
import { type SelectOption } from '@/components/Forms/Select.vue'
import SelectSearch from '@/components/Forms/SelectSearch.vue'
import { useClinicsStore } from '@/stores/clinics'

const clinics = useClinicsStore()

const loading = ref(true)
const saving = ref(false)
const savingMedia = ref(false)
const savingRetention = ref(false)
const error = ref('')
const success = ref('')
const mediaSuccess = ref('')
const retentionSuccess = ref('')
const prompt = ref('')
const fieldError = ref('')

const credentialsLoading = ref(true)
const credentialsSaving = ref(false)
const credentialsError = ref('')
const credentialsSuccess = ref('')
const connection = ref<ClinicConnection | null>(null)
const credentials = ref({
  api_username: '',
  api_password: '',
})

const media = ref({
  openrouter_transcription_model: '',
  openrouter_transcription_language: '',
  openrouter_vision_model: '',
  openrouter_vision_system_prompt: '',
  openrouter_vision_instruction: '',
})

const retention = ref({
  whatsapp_media_retention_days: '90',
  whatsapp_media_max_mb_per_clinic: '2048',
})

const mediaErrors = ref<Record<string, string>>({})
const retentionErrors = ref<Record<string, string>>({})

const transcriptionModels = ref<SelectOption[]>([])
const visionModels = ref<SelectOption[]>([])
const modelsLoading = ref(false)
const modelsError = ref('')

const languageOptions: SelectOption[] = [
  { value: 'pt', label: 'Português (pt)' },
  { value: 'en', label: 'Inglês (en)' },
  { value: 'es', label: 'Espanhol (es)' },
  { value: 'fr', label: 'Francês (fr)' },
  { value: 'it', label: 'Italiano (it)' },
  { value: 'de', label: 'Alemão (de)' },
]

const clinicName = computed(() => clinics.activeClinic?.name ?? 'Clínica ativa')

const inputClass =
  'w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25'

/** Mantém o valor salvo na lista mesmo se ele não vier mais do catálogo. */
function withCurrent(options: SelectOption[], current: string): SelectOption[] {
  const value = current.trim()
  if (!value || options.some((o) => o.value === value)) return options
  return [{ value, label: `${value} (atual)` }, ...options]
}

const transcriptionOptions = computed(() =>
  withCurrent(transcriptionModels.value, media.value.openrouter_transcription_model),
)

const visionOptions = computed(() =>
  withCurrent(visionModels.value, media.value.openrouter_vision_model),
)

const languageSelectOptions = computed(() =>
  withCurrent(languageOptions, media.value.openrouter_transcription_language),
)

function applySettings(settings: SystemSettings) {
  prompt.value = settings.ai_attendance_summary_system_prompt || ''
  media.value.openrouter_transcription_model = settings.openrouter_transcription_model || ''
  media.value.openrouter_transcription_language = settings.openrouter_transcription_language || ''
  media.value.openrouter_vision_model = settings.openrouter_vision_model || ''
  media.value.openrouter_vision_system_prompt = settings.openrouter_vision_system_prompt || ''
  media.value.openrouter_vision_instruction = settings.openrouter_vision_instruction || ''
  retention.value.whatsapp_media_retention_days = String(settings.whatsapp_media_retention_days || '90')
  retention.value.whatsapp_media_max_mb_per_clinic = String(
    settings.whatsapp_media_max_mb_per_clinic || '2048',
  )
}

function applyConnection(next: ClinicConnection) {
  connection.value = next
  credentials.value.api_username = next.api_username ?? ''
}

async function loadCredentials() {
  credentialsLoading.value = true
  credentialsError.value = ''
  credentialsSuccess.value = ''
  try {
    applyConnection(await getConnection())
  } catch (e) {
    connection.value = null
    credentials.value.api_username = ''
    credentials.value.api_password = ''
    credentialsError.value =
      e instanceof ApiError
        ? e.message
        : 'Não foi possível carregar as credenciais do WhatsApp.'
  } finally {
    credentialsLoading.value = false
  }
}

async function saveCredentials() {
  if (credentialsSaving.value) return
  credentialsSaving.value = true
  credentialsError.value = ''
  credentialsSuccess.value = ''
  try {
    const next = await updateConnectionCredentials({
      api_username: credentials.value.api_username.trim(),
      api_password: credentials.value.api_password,
    })
    applyConnection(next)
    credentials.value.api_password = ''
    credentialsSuccess.value = 'Credenciais salvas.'
  } catch (e) {
    credentialsError.value =
      e instanceof ApiError ? e.message : 'Não foi possível salvar as credenciais.'
  } finally {
    credentialsSaving.value = false
  }
}

async function loadModels(capability: OpenRouterModelCapability): Promise<SelectOption[]> {
  const models = await listOpenRouterModels(capability)
  return models.map((m) => ({ value: m.value, label: m.label }))
}

async function loadCatalog() {
  modelsLoading.value = true
  modelsError.value = ''
  try {
    const [transcription, vision] = await Promise.all([
      loadModels('transcription'),
      loadModels('vision'),
    ])
    transcriptionModels.value = transcription
    visionModels.value = vision
  } catch (e) {
    modelsError.value =
      e instanceof ApiError
        ? `Não foi possível listar os modelos da OpenRouter: ${e.message}`
        : 'Não foi possível listar os modelos da OpenRouter.'
  } finally {
    modelsLoading.value = false
  }
}

async function load() {
  loading.value = true
  error.value = ''
  success.value = ''
  mediaSuccess.value = ''
  retentionSuccess.value = ''
  mediaErrors.value = {}
  retentionErrors.value = {}
  try {
    applySettings(await getSystemSettings())
  } catch (e) {
    error.value =
      e instanceof ApiError ? e.message : 'Não foi possível carregar as configurações.'
    return
  } finally {
    loading.value = false
  }

  await loadCatalog()
}

async function save() {
  if (saving.value) return
  fieldError.value = ''
  success.value = ''
  error.value = ''

  if (prompt.value.trim().length < 20) {
    fieldError.value = 'Informe um prompt com pelo menos 20 caracteres.'
    return
  }

  saving.value = true
  try {
    const settings = await updateSystemSettings({
      ai_attendance_summary_system_prompt: prompt.value,
    })
    prompt.value = settings.ai_attendance_summary_system_prompt
    success.value = 'Configuração salva.'
  } catch (e) {
    if (e instanceof ApiError) {
      fieldError.value =
        e.details?.ai_attendance_summary_system_prompt?.[0] || e.message
    } else {
      error.value = 'Não foi possível salvar.'
    }
  } finally {
    saving.value = false
  }
}

async function saveMedia() {
  if (savingMedia.value) return
  mediaErrors.value = {}
  mediaSuccess.value = ''
  error.value = ''

  savingMedia.value = true
  try {
    const settings = await updateSystemSettings({
      openrouter_transcription_model: media.value.openrouter_transcription_model.trim(),
      openrouter_transcription_language: media.value.openrouter_transcription_language
        .trim()
        .toLowerCase(),
      openrouter_vision_model: media.value.openrouter_vision_model.trim(),
      openrouter_vision_system_prompt: media.value.openrouter_vision_system_prompt.trim(),
      openrouter_vision_instruction: media.value.openrouter_vision_instruction.trim(),
    })
    applySettings(settings)
    mediaSuccess.value = 'Configurações de mídia salvas.'
  } catch (e) {
    if (e instanceof ApiError) {
      const details = e.details ?? {}
      mediaErrors.value = {
        openrouter_transcription_model: details.openrouter_transcription_model?.[0] || '',
        openrouter_transcription_language: details.openrouter_transcription_language?.[0] || '',
        openrouter_vision_model: details.openrouter_vision_model?.[0] || '',
        openrouter_vision_system_prompt: details.openrouter_vision_system_prompt?.[0] || '',
        openrouter_vision_instruction: details.openrouter_vision_instruction?.[0] || '',
      }
      if (!Object.values(mediaErrors.value).some(Boolean)) {
        error.value = e.message
      }
    } else {
      error.value = 'Não foi possível salvar.'
    }
  } finally {
    savingMedia.value = false
  }
}

async function saveRetention() {
  if (savingRetention.value) return
  retentionErrors.value = {}
  retentionSuccess.value = ''
  error.value = ''

  savingRetention.value = true
  try {
    const settings = await updateSystemSettings({
      whatsapp_media_retention_days: String(
        Number.parseInt(retention.value.whatsapp_media_retention_days, 10) || 0,
      ),
      whatsapp_media_max_mb_per_clinic: String(
        Number.parseInt(retention.value.whatsapp_media_max_mb_per_clinic, 10) || 0,
      ),
    })
    applySettings(settings)
    retentionSuccess.value = 'Retenção de mídia salva.'
  } catch (e) {
    if (e instanceof ApiError) {
      const details = e.details ?? {}
      retentionErrors.value = {
        whatsapp_media_retention_days: details.whatsapp_media_retention_days?.[0] || '',
        whatsapp_media_max_mb_per_clinic: details.whatsapp_media_max_mb_per_clinic?.[0] || '',
      }
      if (!Object.values(retentionErrors.value).some(Boolean)) {
        error.value = e.message
      }
    } else {
      error.value = 'Não foi possível salvar.'
    }
  } finally {
    savingRetention.value = false
  }
}

watch(
  () => clinics.activeClinicId,
  () => {
    void loadCredentials()
  },
)

onMounted(() => {
  void load()
  void loadCredentials()
})
</script>

<template>
  <div class="max-w-3xl space-y-5">
    <div class="rounded-2xl border border-brand-ink/10 bg-white p-5">
      <h2 class="text-base font-semibold text-brand-ink">Credenciais da API WhatsApp</h2>
      <p class="mt-1 text-sm text-brand-ink/60">
        Usuário e senha da API WhatsApp da clínica
        <strong class="font-medium text-brand-ink">{{ clinicName }}</strong>.
        Troque a clínica no seletor do menu para editar outra.
      </p>

      <div v-if="credentialsLoading" class="mt-5 flex flex-col gap-3" aria-busy="true">
        <div class="grid gap-3 sm:grid-cols-2">
          <Skeleton class="h-11 w-full rounded-xl" />
          <Skeleton class="h-11 w-full rounded-xl" />
        </div>
        <Skeleton class="h-10 w-40 rounded-full" />
      </div>

      <template v-else>
        <p
          v-if="credentialsError"
          class="mt-3 rounded-xl bg-brand-ink/[0.04] px-3 py-2 text-sm text-brand-ink/70"
          role="alert"
        >
          {{ credentialsError }}
        </p>

        <form class="mt-5 flex flex-col gap-4" @submit.prevent="saveCredentials">
          <div class="grid gap-4 sm:grid-cols-2">
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

          <p v-if="connection?.phone" class="text-sm text-brand-ink/55">
            Número conectado: {{ connection.phone }}
          </p>

          <p v-if="credentialsSuccess" class="text-sm text-brand-cyan-ink" role="status">
            {{ credentialsSuccess }}
          </p>

          <div class="flex flex-wrap gap-2">
            <Button type="submit" :loading="credentialsSaving" icon="lucide:save">
              Salvar credenciais
            </Button>
            <Button
              type="button"
              variant="secondary"
              :disabled="credentialsSaving"
              icon="lucide:refresh-cw"
              @click="loadCredentials"
            >
              Recarregar
            </Button>
          </div>
        </form>
      </template>
    </div>

    <ContentSkeleton v-if="loading" variant="detail" />

    <div
      v-else-if="error"
      class="rounded-2xl border border-brand-ink/10 bg-white px-4 py-3 text-sm text-brand-ink"
    >
      {{ error }}
    </div>

    <template v-else>
      <div class="rounded-2xl border border-brand-ink/10 bg-white p-5">
        <h2 class="text-base font-semibold text-brand-ink">Anotações IA</h2>
        <p class="mt-1 text-sm text-brand-ink/60">
          System prompt global usado ao gerar o resumo do atendimento WhatsApp (todas as clínicas).
        </p>

        <label class="mt-5 flex flex-col gap-1.5">
          <span class="text-sm font-medium text-brand-ink/80">System prompt</span>
          <textarea
            v-model="prompt"
            rows="12"
            class="w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
          />
          <span v-if="fieldError" class="text-sm text-brand-ink/70" role="alert">
            {{ fieldError }}
          </span>
        </label>

        <p v-if="success" class="mt-3 text-sm text-brand-cyan-ink" role="status">{{ success }}</p>

        <div class="mt-4 flex flex-wrap gap-2">
          <Button :loading="saving" icon="lucide:save" @click="save">Salvar</Button>
          <Button variant="secondary" :disabled="saving" icon="lucide:refresh-cw" @click="load">
            Recarregar
          </Button>
        </div>
      </div>

      <div class="rounded-2xl border border-brand-ink/10 bg-white p-5">
        <h2 class="text-base font-semibold text-brand-ink">Mídia do WhatsApp (OpenRouter)</h2>
        <p class="mt-1 text-sm text-brand-ink/60">
          Modelos usados para transcrever áudios e descrever imagens do paciente antes do agent
          responder. Só rodam quando o agent está no controle da conversa.
        </p>

        <p
          v-if="modelsError"
          class="mt-3 rounded-xl bg-brand-ink/[0.04] px-3 py-2 text-sm text-brand-ink/70"
          role="alert"
        >
          {{ modelsError }}
        </p>

        <div class="mt-5 grid gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Modelo de transcrição</span>
            <SelectSearch
              v-model="media.openrouter_transcription_model"
              :options="transcriptionOptions"
              :disabled="modelsLoading"
              :placeholder="modelsLoading ? 'Carregando modelos…' : 'Selecione um modelo…'"
              search-placeholder="Pesquisar modelo…"
              empty-label="Nenhum modelo de transcrição encontrado."
            />
            <span class="text-xs text-brand-ink/50">
              Só modelos com saída de transcrição (speech-to-text).
            </span>
            <span
              v-if="mediaErrors.openrouter_transcription_model"
              class="text-sm text-brand-ink/70"
              role="alert"
            >
              {{ mediaErrors.openrouter_transcription_model }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Idioma do áudio</span>
            <SelectSearch
              v-model="media.openrouter_transcription_language"
              :options="languageSelectOptions"
              placeholder="Selecione o idioma…"
              search-placeholder="Pesquisar idioma…"
              empty-label="Nenhum idioma encontrado."
            />
            <span class="text-xs text-brand-ink/50">Código ISO-639-1 enviado na transcrição.</span>
            <span
              v-if="mediaErrors.openrouter_transcription_language"
              class="text-sm text-brand-ink/70"
              role="alert"
            >
              {{ mediaErrors.openrouter_transcription_language }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5 sm:col-span-2">
            <span class="text-sm font-medium text-brand-ink/80">Modelo de visão (imagens)</span>
            <SelectSearch
              v-model="media.openrouter_vision_model"
              :options="visionOptions"
              :disabled="modelsLoading"
              :placeholder="modelsLoading ? 'Carregando modelos…' : 'Selecione um modelo…'"
              search-placeholder="Pesquisar modelo…"
              empty-label="Nenhum modelo de visão encontrado."
            />
            <span class="text-xs text-brand-ink/50">
              Só modelos que aceitam imagem na entrada e respondem em texto.
            </span>
            <span
              v-if="mediaErrors.openrouter_vision_model"
              class="text-sm text-brand-ink/70"
              role="alert"
            >
              {{ mediaErrors.openrouter_vision_model }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5 sm:col-span-2">
            <span class="text-sm font-medium text-brand-ink/80">System prompt da visão</span>
            <textarea
              v-model="media.openrouter_vision_system_prompt"
              rows="5"
              class="w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
            />
            <span class="text-xs text-brand-ink/50">
              Instrução de sistema enviada ao modelo ao descrever imagens do paciente.
            </span>
            <span
              v-if="mediaErrors.openrouter_vision_system_prompt"
              class="text-sm text-brand-ink/70"
              role="alert"
            >
              {{ mediaErrors.openrouter_vision_system_prompt }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5 sm:col-span-2">
            <span class="text-sm font-medium text-brand-ink/80">Instrução do usuário (visão)</span>
            <textarea
              v-model="media.openrouter_vision_instruction"
              rows="2"
              class="w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
            />
            <span class="text-xs text-brand-ink/50">
              Texto enviado junto com a imagem no papel de usuário.
            </span>
            <span
              v-if="mediaErrors.openrouter_vision_instruction"
              class="text-sm text-brand-ink/70"
              role="alert"
            >
              {{ mediaErrors.openrouter_vision_instruction }}
            </span>
          </label>
        </div>

        <p v-if="mediaSuccess" class="mt-3 text-sm text-brand-cyan-ink" role="status">
          {{ mediaSuccess }}
        </p>

        <div class="mt-4 flex flex-wrap gap-2">
          <Button :loading="savingMedia" icon="lucide:save" @click="saveMedia">Salvar</Button>
          <Button
            variant="secondary"
            :disabled="savingMedia || modelsLoading"
            icon="lucide:refresh-cw"
            @click="load"
          >
            Recarregar
          </Button>
        </div>
      </div>

      <div class="rounded-2xl border border-brand-ink/10 bg-white p-5">
        <h2 class="text-base font-semibold text-brand-ink">Armazenamento de mídia</h2>
        <p class="mt-1 text-sm text-brand-ink/60">
          Arquivos de áudio, imagem e documento são apagados automaticamente. A mensagem, a
          transcrição e a descrição da IA permanecem no histórico.
        </p>

        <div class="mt-5 grid gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Retenção (dias)</span>
            <input
              v-model="retention.whatsapp_media_retention_days"
              type="number"
              min="1"
              max="3650"
              class="w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
            />
            <span class="text-xs text-brand-ink/50">Arquivos mais velhos que isso saem do disco.</span>
            <span
              v-if="retentionErrors.whatsapp_media_retention_days"
              class="text-sm text-brand-ink/70"
              role="alert"
            >
              {{ retentionErrors.whatsapp_media_retention_days }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Teto por clínica (MB)</span>
            <input
              v-model="retention.whatsapp_media_max_mb_per_clinic"
              type="number"
              min="50"
              max="102400"
              class="w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
            />
            <span class="text-xs text-brand-ink/50">
              Se passar do teto, os arquivos mais antigos daquela clínica saem primeiro.
            </span>
            <span
              v-if="retentionErrors.whatsapp_media_max_mb_per_clinic"
              class="text-sm text-brand-ink/70"
              role="alert"
            >
              {{ retentionErrors.whatsapp_media_max_mb_per_clinic }}
            </span>
          </label>
        </div>

        <p v-if="retentionSuccess" class="mt-3 text-sm text-brand-cyan-ink" role="status">
          {{ retentionSuccess }}
        </p>

        <div class="mt-4 flex flex-wrap gap-2">
          <Button :loading="savingRetention" icon="lucide:save" @click="saveRetention">Salvar</Button>
          <Button
            variant="secondary"
            :disabled="savingRetention"
            icon="lucide:refresh-cw"
            @click="load"
          >
            Recarregar
          </Button>
        </div>
      </div>
    </template>
  </div>
</template>
