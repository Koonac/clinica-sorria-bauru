<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from '@/components/Buttons/Button.vue'
import { inputClass, labelClass } from '@/utils/crmFormat'

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  confirm: [reason: string]
  cancel: []
}>()

const reason = ref('')
const error = ref('')

function close() {
  open.value = false
  emit('cancel')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    close()
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    reason.value = ''
    error.value = ''
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => document.removeEventListener('keydown', onKeydown))

function submit() {
  const value = reason.value.trim()
  if (!value) {
    error.value = 'Informe o motivo da perda.'
    return
  }
  emit('confirm', value)
  open.value = false
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
      @click.self="close"
    >
      <div role="dialog" aria-modal="true" class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div class="flex items-start justify-between gap-3">
          <h2 class="text-xl font-semibold text-brand-ink">Motivo da perda</h2>
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
            <label :class="labelClass" for="lost-reason">Motivo</label>
            <textarea id="lost-reason" v-model="reason" rows="3" required :class="inputClass" />
          </div>
          <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
          <div class="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" @click="close">Cancelar</Button>
            <Button type="submit" variant="danger">Confirmar</Button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
