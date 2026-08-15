<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import {
  createAgent,
  updateAgent,
  type Agent,
} from '@/api/crm/agents'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  agent: Agent | null
}>()

const emit = defineEmits<{
  saved: [agent: Agent]
}>()

const inputClass =
  'w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25'

const isEdit = computed(() => Boolean(props.agent))

const form = reactive({
  name: '',
  system_prompt: '',
  model: '',
  debounce_seconds: 10,
  is_active: false,
})

const fieldErrors = reactive({
  name: '',
  system_prompt: '',
  model: '',
  debounce_seconds: '',
  is_active: '',
})

const loading = ref(false)
const formError = ref('')
const panelRef = ref<HTMLElement | null>(null)

const canSubmit = computed(() => {
  if (loading.value) return false
  if (!form.name.trim()) return false
  if (form.is_active && !form.system_prompt.trim()) return false
  const debounce = Number(form.debounce_seconds)
  if (!Number.isFinite(debounce) || debounce < 3 || debounce > 60) return false
  return true
})

function clearFieldErrors() {
  fieldErrors.name = ''
  fieldErrors.system_prompt = ''
  fieldErrors.model = ''
  fieldErrors.debounce_seconds = ''
  fieldErrors.is_active = ''
}

function resetForm() {
  form.name = props.agent?.name ?? ''
  form.system_prompt = props.agent?.system_prompt ?? ''
  form.model = props.agent?.model ?? ''
  form.debounce_seconds = props.agent?.debounce_seconds ?? 10
  form.is_active = props.agent?.is_active ?? false
  loading.value = false
  formError.value = ''
  clearFieldErrors()
}

function close() {
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    close()
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    resetForm()
    document.addEventListener('keydown', onKeydown)
    requestAnimationFrame(() => {
      panelRef.value?.querySelector<HTMLInputElement>('input')?.focus()
    })
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})

function applyApiFieldErrors(details?: Record<string, string[]>) {
  if (!details) return
  fieldErrors.name = details.name?.[0] || ''
  fieldErrors.system_prompt = details.system_prompt?.[0] || ''
  fieldErrors.model = details.model?.[0] || ''
  fieldErrors.debounce_seconds = details.debounce_seconds?.[0] || ''
  fieldErrors.is_active = details.is_active?.[0] || ''
}

async function onSubmit() {
  if (!canSubmit.value) return

  clearFieldErrors()
  formError.value = ''

  if (form.is_active && !form.system_prompt.trim()) {
    fieldErrors.system_prompt = 'Defina o system prompt para ativar o agent.'
    return
  }

  loading.value = true

  try {
    const payload = {
      name: form.name.trim(),
      system_prompt: form.system_prompt.trim() || null,
      model: form.model.trim() || null,
      debounce_seconds: Number(form.debounce_seconds),
      is_active: form.is_active,
    }

    const saved =
      isEdit.value && props.agent
        ? await updateAgent(props.agent.id, payload)
        : await createAgent(payload)

    emit('saved', saved)
    close()
  } catch (error) {
    if (error instanceof ApiError) {
      applyApiFieldErrors(error.details)
      const hasFieldError = Object.values(fieldErrors).some(Boolean)
      if (!hasFieldError) {
        formError.value =
          error.message ||
          (isEdit.value ? 'Não foi possível salvar o agent.' : 'Não foi possível criar o agent.')
      }
    } else {
      formError.value = 'Servidor indisponível. Tente novamente.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      @click.self="close"
    >
      <div
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="isEdit ? 'agent-edit-title' : 'agent-create-title'"
        class="flex max-h-[min(90vh,820px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-brand-ink/10 bg-white shadow-2xl"
        @click.stop
      >
        <header
          class="flex shrink-0 items-start justify-between gap-3 border-b border-brand-ink/10 px-5 pt-5 pb-4"
        >
          <div class="min-w-0">
            <p class="mb-1 text-[0.65rem] font-medium tracking-[0.22em] text-brand-cyan-ink uppercase">
              Agents
            </p>
            <h2
              :id="isEdit ? 'agent-edit-title' : 'agent-create-title'"
              class="text-xl font-semibold tracking-tight text-brand-ink"
            >
              {{ isEdit ? 'Editar agent' : 'Cadastrar agent' }}
            </h2>
          </div>
          <button
            type="button"
            class="inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-brand-ink/55 transition hover:bg-[#f4f6f8] hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            aria-label="Fechar"
            @click="close"
          >
            <Icon icon="lucide:x" class="size-[18px]" aria-hidden="true" />
          </button>
        </header>

        <form
          class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5"
          @submit.prevent="onSubmit"
        >
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Nome</span>
            <input
              v-model="form.name"
              type="text"
              name="name"
              required
              maxlength="255"
              :class="inputClass"
            />
            <span v-if="fieldErrors.name" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.name }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">System prompt</span>
            <textarea
              v-model="form.system_prompt"
              name="system_prompt"
              rows="6"
              :required="form.is_active"
              placeholder="Instruções do agent para atendimento no WhatsApp"
              :class="[inputClass, 'min-h-32 resize-y']"
            />
            <span v-if="fieldErrors.system_prompt" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.system_prompt }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Modelo (opcional)</span>
            <input
              v-model="form.model"
              type="text"
              name="model"
              maxlength="255"
              placeholder="ex.: openai/gpt-4o-mini"
              :class="inputClass"
            />
            <span v-if="fieldErrors.model" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.model }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Debounce (segundos)</span>
            <input
              v-model.number="form.debounce_seconds"
              type="number"
              name="debounce_seconds"
              min="3"
              max="60"
              required
              :class="inputClass"
            />
            <span class="text-xs text-brand-ink/45">Entre 3 e 60. Padrão: 10.</span>
            <span
              v-if="fieldErrors.debounce_seconds"
              class="text-sm text-brand-ink/70"
              role="alert"
            >
              {{ fieldErrors.debounce_seconds }}
            </span>
          </label>

          <label
            class="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-ink/10 bg-[#f4f6f8]/70 px-4 py-3"
          >
            <input
              v-model="form.is_active"
              type="checkbox"
              name="is_active"
              class="mt-0.5 size-4 cursor-pointer rounded border-brand-ink/25 text-brand-blue focus:ring-brand-cyan/30"
            />
            <span class="min-w-0">
              <span class="block text-sm font-medium text-brand-ink">Ativar este agent</span>
              <span class="mt-0.5 block text-xs leading-snug text-brand-ink/55">
                Só um agent fica ativo por clínica. Ativar este desativa os demais.
              </span>
            </span>
          </label>
          <span v-if="fieldErrors.is_active" class="text-sm text-brand-ink/70" role="alert">
            {{ fieldErrors.is_active }}
          </span>

          <p
            v-if="formError"
            class="rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
            role="alert"
          >
            {{ formError }}
          </p>

          <div class="mt-1 flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              :disabled="!canSubmit"
              class="cursor-pointer rounded-full bg-brand-cyan px-6 py-3 text-sm font-semibold text-brand-ink transition hover:-translate-y-px hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span v-if="loading">Salvando…</span>
              <span v-else>{{ isEdit ? 'Salvar' : 'Cadastrar' }}</span>
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-full border border-brand-ink/15 px-6 py-3 text-sm font-medium text-brand-ink/70 transition hover:border-brand-ink/25 hover:bg-[#f4f6f8] hover:text-brand-ink"
              @click="close"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
