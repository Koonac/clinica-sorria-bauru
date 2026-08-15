<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import { createLead } from '@/api/crm/leads'
import type { CreateLeadPayload, Source } from '@/api/crm/types'
import Button from '@/components/Buttons/Button.vue'
import Select from '@/components/Forms/Select.vue'
import { inputClass, labelClass } from '@/utils/crmFormat'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  sources: Source[]
}>()

const emit = defineEmits<{
  saved: []
}>()

const sourceOptions = computed(() => [
  { value: '', label: '—' },
  ...props.sources.map((s) => ({ value: s.id, label: s.name })),
])

const loading = ref(false)
const formError = ref('')
const form = reactive({
  name: '',
  email: '',
  mobile: '',
  instagram: '',
  organization_name: '',
  title: '',
  value: '',
  source_id: '' as string | number,
})

const canSubmit = computed(() => Boolean(form.name.trim()) && !loading.value)

function reset() {
  form.name = ''
  form.email = ''
  form.mobile = ''
  form.instagram = ''
  form.organization_name = ''
  form.title = ''
  form.value = ''
  form.source_id = ''
  formError.value = ''
  loading.value = false
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
    reset()
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => document.removeEventListener('keydown', onKeydown))

async function submit() {
  if (!canSubmit.value) return
  loading.value = true
  formError.value = ''
  try {
    const payload: CreateLeadPayload = {
      name: form.name.trim(),
      title: form.title.trim() || undefined,
      email: form.email.trim() || null,
      mobile: form.mobile.trim() || null,
      instagram: form.instagram.trim() || null,
      organization_name: form.organization_name.trim() || null,
      source_id: form.source_id === '' ? null : Number(form.source_id),
      value: form.value === '' ? null : Number(form.value),
      currency: 'BRL',
    }
    await createLead(payload)
    emit('saved')
    close()
  } catch (error) {
    formError.value =
      error instanceof ApiError ? error.message : 'Não foi possível criar o lead.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      @click.self="close"
    >
      <div
        role="dialog"
        aria-modal="true"
        class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-[0.7rem] font-medium tracking-[0.2em] text-brand-cyan-ink uppercase">
              CRM
            </p>
            <h2 class="mt-1 text-xl font-semibold text-brand-ink">Novo lead</h2>
          </div>
          <button
            type="button"
            class="rounded-full p-2 text-brand-ink/45 hover:bg-[#f4f6f8]"
            aria-label="Fechar"
            @click="close"
          >
            <Icon icon="lucide:x" class="size-5" />
          </button>
        </div>

        <form class="mt-5 space-y-3" @submit.prevent="submit">
          <div>
            <label :class="labelClass" for="lead-name">Nome *</label>
            <input id="lead-name" v-model="form.name" required :class="inputClass" />
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label :class="labelClass" for="lead-email">E-mail</label>
              <input id="lead-email" v-model="form.email" type="email" :class="inputClass" />
            </div>
            <div>
              <label :class="labelClass" for="lead-mobile">Celular</label>
              <input id="lead-mobile" v-model="form.mobile" :class="inputClass" />
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label :class="labelClass" for="lead-ig">Instagram</label>
              <input id="lead-ig" v-model="form.instagram" :class="inputClass" />
            </div>
            <div>
              <label :class="labelClass" for="lead-org">Empresa</label>
              <input id="lead-org" v-model="form.organization_name" :class="inputClass" />
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label :class="labelClass" for="lead-source">Origem</label>
              <Select
                id="lead-source"
                v-model="form.source_id"
                placeholder="—"
                :options="sourceOptions"
              />
            </div>
            <div>
              <label :class="labelClass" for="lead-value">Valor</label>
              <input
                id="lead-value"
                v-model="form.value"
                type="number"
                min="0"
                step="0.01"
                :class="inputClass"
              />
            </div>
          </div>
          <div>
            <label :class="labelClass" for="lead-title">Título</label>
            <input id="lead-title" v-model="form.title" :class="inputClass" />
          </div>

          <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>

          <div class="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" @click="close">Cancelar</Button>
            <Button type="submit" :loading="loading" :disabled="!canSubmit">Salvar</Button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
