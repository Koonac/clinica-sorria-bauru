<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from '@/components/Buttons/Button.vue'

const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(
  defineProps<{
    title?: string
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    confirmVariant?: 'primary' | 'secondary' | 'danger' | 'ghost'
    busy?: boolean
  }>(),
  {
    title: 'Confirmar',
    message: '',
    confirmLabel: 'Confirmar',
    cancelLabel: 'Cancelar',
    confirmVariant: 'primary',
    busy: false,
  },
)

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

function onConfirm() {
  if (props.busy) return
  emit('confirm')
}

function onCancel() {
  if (props.busy) return
  open.value = false
  emit('cancel')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    onCancel()
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
      @click.self="onCancel"
    >
      <div
        role="dialog"
        aria-modal="true"
        :aria-labelledby="'confirm-modal-title'"
        class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <div class="flex items-start justify-between gap-3">
          <h2 id="confirm-modal-title" class="text-xl font-semibold text-brand-ink">
            {{ title }}
          </h2>
          <button
            type="button"
            class="rounded-full p-2 text-brand-ink/45 hover:bg-[#f4f6f8] disabled:opacity-40"
            aria-label="Fechar"
            :disabled="busy"
            @click="onCancel"
          >
            <Icon icon="lucide:x" class="size-5" />
          </button>
        </div>

        <p v-if="message" class="mt-3 text-sm leading-relaxed text-brand-ink/70">
          {{ message }}
        </p>

        <div class="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" type="button" :disabled="busy" @click="onCancel">
            {{ cancelLabel }}
          </Button>
          <Button
            type="button"
            :variant="confirmVariant"
            :loading="busy"
            @click="onConfirm"
          >
            {{ confirmLabel }}
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
