<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '@/api/client'
import {
  getSystemSettings,
  listOpenRouterModels,
  updateSystemSettings,
  type OpenRouterModelCapability,
  type SystemSettings,
} from '@/api/dev'
import Button from '@/components/Buttons/Button.vue'
import ContentSkeleton from '@/components/Feedback/ContentSkeleton.vue'
import Select, { type SelectOption } from '@/components/Forms/Select.vue'

const loading = ref(true)
const saving = ref(false)
const savingMedia = ref(false)
const error = ref('')
const success = ref('')
const mediaSuccess = ref('')
const prompt = ref('')
const fieldError = ref('')

const media = ref({
  openrouter_transcription_model: '',
  openrouter_transcription_language: '',
  openrouter_vision_model: '',
})

const mediaErrors = ref<Record<string, string>>({})

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
  mediaErrors.value = {}
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

onMounted(() => {
  void load()
})
</script>

<template>
  <ContentSkeleton v-if="loading" variant="detail" />

  <div
    v-else-if="error"
    class="rounded-2xl border border-brand-ink/10 bg-white px-4 py-3 text-sm text-brand-ink"
  >
    {{ error }}
  </div>

  <div v-else class="max-w-3xl space-y-5">
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
          <Select
            v-model="media.openrouter_transcription_model"
            :options="transcriptionOptions"
            :disabled="modelsLoading"
            :placeholder="modelsLoading ? 'Carregando modelos…' : 'Selecione um modelo…'"
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
          <Select
            v-model="media.openrouter_transcription_language"
            :options="languageSelectOptions"
            placeholder="Selecione o idioma…"
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
          <Select
            v-model="media.openrouter_vision_model"
            :options="visionOptions"
            :disabled="modelsLoading"
            :placeholder="modelsLoading ? 'Carregando modelos…' : 'Selecione um modelo…'"
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
  </div>
</template>
