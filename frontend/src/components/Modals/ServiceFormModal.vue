<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import {
  createService,
  updateService,
  type ClinicService,
} from '@/api/crm/services'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  service: ClinicService | null
}>()

const emit = defineEmits<{
  saved: [service: ClinicService]
}>()

const inputClass =
  'w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25'

const isEdit = computed(() => Boolean(props.service))

const form = reactive({
  code: '',
  name: '',
  duration_minutes: '',
  price_particular_min: '',
  price_particular_max: '',
  accepts_insurance: false,
  description: '',
})

const fieldErrors = reactive({
  code: '',
  name: '',
  duration_minutes: '',
  price_particular_min: '',
  price_particular_max: '',
  accepts_insurance: '',
  description: '',
})

const loading = ref(false)
const formError = ref('')
const panelRef = ref<HTMLElement | null>(null)

const canSubmit = computed(() => {
  if (loading.value) return false
  if (!form.code.trim() || !form.name.trim()) return false
  if (!form.duration_minutes || !form.price_particular_min || !form.price_particular_max) {
    return false
  }
  return true
})

function clearFieldErrors() {
  fieldErrors.code = ''
  fieldErrors.name = ''
  fieldErrors.duration_minutes = ''
  fieldErrors.price_particular_min = ''
  fieldErrors.price_particular_max = ''
  fieldErrors.accepts_insurance = ''
  fieldErrors.description = ''
}

function resetForm() {
  form.code = props.service?.code ?? ''
  form.name = props.service?.name ?? ''
  form.duration_minutes = props.service ? String(props.service.duration_minutes) : ''
  form.price_particular_min = props.service
    ? String(props.service.price_particular_min)
    : ''
  form.price_particular_max = props.service
    ? String(props.service.price_particular_max)
    : ''
  form.accepts_insurance = props.service?.accepts_insurance ?? false
  form.description = props.service?.description ?? ''
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
  fieldErrors.code = details.code?.[0] || ''
  fieldErrors.name = details.name?.[0] || ''
  fieldErrors.duration_minutes = details.duration_minutes?.[0] || ''
  fieldErrors.price_particular_min = details.price_particular_min?.[0] || ''
  fieldErrors.price_particular_max = details.price_particular_max?.[0] || ''
  fieldErrors.accepts_insurance = details.accepts_insurance?.[0] || ''
  fieldErrors.description = details.description?.[0] || ''
}

function parseNumber(value: string): number {
  return Number(String(value).replace(',', '.'))
}

async function onSubmit() {
  if (!canSubmit.value) return

  clearFieldErrors()
  formError.value = ''

  const duration = Number.parseInt(form.duration_minutes, 10)
  const priceMin = parseNumber(form.price_particular_min)
  const priceMax = parseNumber(form.price_particular_max)

  if (!Number.isFinite(duration) || duration < 1) {
    fieldErrors.duration_minutes = 'Informe a duração em minutos.'
    return
  }
  if (!Number.isFinite(priceMin) || priceMin < 0) {
    fieldErrors.price_particular_min = 'Informe o preço mínimo.'
    return
  }
  if (!Number.isFinite(priceMax) || priceMax < 0) {
    fieldErrors.price_particular_max = 'Informe o preço máximo.'
    return
  }
  if (priceMax < priceMin) {
    fieldErrors.price_particular_max = 'O preço máximo deve ser maior ou igual ao mínimo.'
    return
  }

  loading.value = true

  try {
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      duration_minutes: duration,
      price_particular_min: priceMin,
      price_particular_max: priceMax,
      accepts_insurance: form.accepts_insurance,
      description: form.description.trim() || null,
    }

    const saved =
      isEdit.value && props.service
        ? await updateService(props.service.id, payload)
        : await createService(payload)

    emit('saved', saved)
    close()
  } catch (error) {
    if (error instanceof ApiError) {
      applyApiFieldErrors(error.details)
      const hasFieldError = Object.values(fieldErrors).some(Boolean)
      if (!hasFieldError) {
        formError.value =
          error.message ||
          (isEdit.value
            ? 'Não foi possível salvar o serviço.'
            : 'Não foi possível cadastrar o serviço.')
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
        :aria-labelledby="isEdit ? 'service-edit-title' : 'service-create-title'"
        class="flex max-h-[min(90vh,820px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-brand-ink/10 bg-white shadow-2xl"
        @click.stop
      >
        <header
          class="flex shrink-0 items-start justify-between gap-3 border-b border-brand-ink/10 px-5 pt-5 pb-4"
        >
          <div class="min-w-0">
            <p class="mb-1 text-[0.65rem] font-medium tracking-[0.22em] text-brand-cyan-ink uppercase">
              Serviços
            </p>
            <h2
              :id="isEdit ? 'service-edit-title' : 'service-create-title'"
              class="text-xl font-semibold tracking-tight text-brand-ink"
            >
              {{ isEdit ? 'Editar serviço' : 'Cadastrar serviço' }}
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

        <form class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5" @submit.prevent="onSubmit">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Código</span>
            <input
              v-model="form.code"
              type="text"
              name="code"
              required
              maxlength="64"
              placeholder="Ex.: ODO-LIMPEZA"
              :class="inputClass"
            />
            <span v-if="fieldErrors.code" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.code }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Nome</span>
            <input
              v-model="form.name"
              type="text"
              name="name"
              required
              maxlength="190"
              placeholder="Ex.: Profilaxia / limpeza"
              :class="inputClass"
            />
            <span v-if="fieldErrors.name" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.name }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Duração (minutos)</span>
            <input
              v-model="form.duration_minutes"
              type="number"
              name="duration_minutes"
              required
              min="1"
              max="1440"
              step="1"
              :class="inputClass"
            />
            <span
              v-if="fieldErrors.duration_minutes"
              class="text-sm text-brand-ink/70"
              role="alert"
            >
              {{ fieldErrors.duration_minutes }}
            </span>
          </label>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-brand-ink/80">Preço particular (mín.)</span>
              <input
                v-model="form.price_particular_min"
                type="number"
                name="price_particular_min"
                required
                min="0"
                step="0.01"
                :class="inputClass"
              />
              <span
                v-if="fieldErrors.price_particular_min"
                class="text-sm text-brand-ink/70"
                role="alert"
              >
                {{ fieldErrors.price_particular_min }}
              </span>
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-brand-ink/80">Preço particular (máx.)</span>
              <input
                v-model="form.price_particular_max"
                type="number"
                name="price_particular_max"
                required
                min="0"
                step="0.01"
                :class="inputClass"
              />
              <span
                v-if="fieldErrors.price_particular_max"
                class="text-sm text-brand-ink/70"
                role="alert"
              >
                {{ fieldErrors.price_particular_max }}
              </span>
            </label>
          </div>

          <label class="flex cursor-pointer items-center gap-3 rounded-xl border border-brand-ink/10 bg-[#f4f6f8]/60 px-4 py-3">
            <input
              v-model="form.accepts_insurance"
              type="checkbox"
              name="accepts_insurance"
              class="size-4 rounded border-brand-ink/25 text-brand-blue focus:ring-brand-cyan/40"
            />
            <span class="text-sm font-medium text-brand-ink/80">Aceita convênio</span>
          </label>
          <span
            v-if="fieldErrors.accepts_insurance"
            class="text-sm text-brand-ink/70"
            role="alert"
          >
            {{ fieldErrors.accepts_insurance }}
          </span>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">
              Descrição
              <span class="font-normal text-brand-ink/45">(opcional)</span>
            </span>
            <textarea
              v-model="form.description"
              name="description"
              rows="4"
              placeholder="Detalhes do serviço, indicações, observações…"
              class="w-full resize-y rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
            />
            <span v-if="fieldErrors.description" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.description }}
            </span>
          </label>

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
