<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import { createActivity } from '@/api/crm/activities'
import Button from '@/components/Buttons/Button.vue'
import { inputClass, labelClass } from '@/utils/crmFormat'

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
  subject: '',
  body: '',
})

const canSubmit = computed(
  () => Boolean(form.body.trim() || form.subject.trim()) && Boolean(props.leadId || props.dealId) && !loading.value,
)

function reset() {
  form.subject = ''
  form.body = ''
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
    await createActivity({
      type: 'note',
      subject: form.subject.trim() || null,
      body: form.body.trim() || null,
      lead_id: props.leadId ?? null,
      deal_id: props.dealId ?? null,
    })
    emit('saved')
    close()
  } catch (error) {
    formError.value =
      error instanceof ApiError ? error.message : 'Não foi possível salvar a nota.'
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
          <h2 class="text-xl font-semibold text-brand-ink">Nova nota</h2>
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
            <label :class="labelClass" for="qn-subject">Assunto</label>
            <input id="qn-subject" v-model="form.subject" :class="inputClass" />
          </div>
          <div>
            <label :class="labelClass" for="qn-body">Nota</label>
            <textarea id="qn-body" v-model="form.body" rows="4" required :class="inputClass" />
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
