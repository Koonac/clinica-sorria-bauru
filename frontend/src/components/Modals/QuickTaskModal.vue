<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import { createTask } from '@/api/crm/tasks'
import Button from '@/components/Buttons/Button.vue'
import { fromLocalInputValue, inputClass, labelClass, toLocalInputValue } from '@/utils/crmFormat'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  leadId?: number | null
  dealId?: number | null
}>()

const emit = defineEmits<{
  saved: []
}>()

const loading = ref(false)
const formError = ref('')
const form = reactive({
  title: '',
  description: '',
  due_at: '',
})

const canSubmit = computed(
  () =>
    Boolean(form.title.trim() && form.due_at) &&
    Boolean(props.leadId || props.dealId) &&
    !loading.value,
)

function reset() {
  const def = new Date()
  def.setHours(def.getHours() + 1, 0, 0, 0)
  form.title = ''
  form.description = ''
  form.due_at = toLocalInputValue(def.toISOString())
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
    await createTask({
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_at: fromLocalInputValue(form.due_at),
      lead_id: props.leadId ?? null,
      deal_id: props.dealId ?? null,
    })
    emit('saved')
    close()
  } catch (error) {
    formError.value =
      error instanceof ApiError ? error.message : 'Não foi possível criar a tarefa.'
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
      <div role="dialog" aria-modal="true" class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div class="flex items-start justify-between gap-3">
          <h2 class="text-xl font-semibold text-brand-ink">Nova tarefa</h2>
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
            <label :class="labelClass" for="qt-title">Título</label>
            <input id="qt-title" v-model="form.title" required :class="inputClass" />
          </div>
          <div>
            <label :class="labelClass" for="qt-due">Prazo</label>
            <input id="qt-due" v-model="form.due_at" type="datetime-local" required :class="inputClass" />
          </div>
          <div>
            <label :class="labelClass" for="qt-desc">Descrição</label>
            <textarea id="qt-desc" v-model="form.description" rows="3" :class="inputClass" />
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
