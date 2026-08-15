<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import type { Clinic } from '@/api/clinics'
import { useClinicsStore } from '@/stores/clinics'

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  created: [clinic: Clinic]
}>()

const clinics = useClinicsStore()

const name = ref('')
const loading = ref(false)
const formError = ref('')
const nameError = ref('')
const panelRef = ref<HTMLElement | null>(null)

const inputClass =
  'w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25'

const canSubmit = computed(() => name.value.trim().length > 0 && !loading.value)

function resetForm() {
  name.value = ''
  loading.value = false
  formError.value = ''
  nameError.value = ''
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

async function onSubmit() {
  if (!canSubmit.value) return

  nameError.value = ''
  formError.value = ''
  loading.value = true

  try {
    const clinic = await clinics.createClinic({ name: name.value.trim() })
    emit('created', clinic)
    close()
  } catch (error) {
    if (error instanceof ApiError) {
      nameError.value = error.details?.name?.[0] || ''
      if (!nameError.value) {
        formError.value = error.message || 'Não foi possível criar a clínica.'
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
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      @click.self="close"
    >
      <div
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clinic-create-title"
        class="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-brand-ink/10 bg-white shadow-2xl"
        @click.stop
      >
        <header
          class="flex shrink-0 items-start justify-between gap-3 border-b border-brand-ink/10 px-5 pt-5 pb-4"
        >
          <div class="min-w-0">
            <p class="mb-1 text-[0.65rem] font-medium tracking-[0.22em] text-brand-cyan-ink uppercase">
              Clínicas
            </p>
            <h2 id="clinic-create-title" class="text-xl font-semibold tracking-tight text-brand-ink">
              Nova clínica
            </h2>
          </div>
          <button
            type="button"
            class="inline-flex cursor-pointer size-8 items-center justify-center rounded-full text-brand-ink/55 transition hover:bg-[#f4f6f8] hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            aria-label="Fechar"
            @click="close"
          >
            <Icon icon="lucide:x" class="size-[18px]" aria-hidden="true" />
          </button>
        </header>

        <form class="flex flex-col gap-4 p-5" @submit.prevent="onSubmit">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Nome</span>
            <input
              v-model="name"
              type="text"
              name="name"
              required
              maxlength="190"
              placeholder="Ex.: Clínica Sorria Marília"
              :class="inputClass"
            />
            <span v-if="nameError" class="text-sm text-brand-ink/70" role="alert">
              {{ nameError }}
            </span>
          </label>

          <p
            v-if="formError"
            class="rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
            role="alert"
          >
            {{ formError }}
          </p>

          <div class="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              :disabled="!canSubmit"
              class="cursor-pointer rounded-full bg-brand-cyan px-6 py-3 text-sm font-semibold text-brand-ink transition hover:-translate-y-px hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span v-if="loading">Criando…</span>
              <span v-else>Criar clínica</span>
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
