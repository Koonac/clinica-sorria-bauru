<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import type { Contact } from '@/api/crm/types'
import Button from '@/components/Buttons/Button.vue'

const open = defineModel<boolean>('open', { default: false })

defineProps<{
  contact: Contact | null
}>()

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
  if (isOpen) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
})

onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && contact"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      @click.self="close"
    >
      <div
        role="dialog"
        aria-modal="true"
        class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-[0.7rem] font-medium tracking-[0.2em] text-brand-cyan-ink uppercase">
              Contato
            </p>
            <h2 class="mt-1 text-xl font-semibold text-brand-ink">{{ contact.name }}</h2>
          </div>
          <button
            type="button"
            class="rounded-full p-2 text-brand-ink/45 hover:bg-[#f4f6f8] hover:text-brand-ink"
            aria-label="Fechar"
            @click="close"
          >
            <Icon icon="lucide:x" class="size-5" />
          </button>
        </div>

        <dl class="mt-5 space-y-3 text-sm">
          <div>
            <dt class="text-brand-ink/45">E-mail</dt>
            <dd class="mt-0.5 text-brand-ink">{{ contact.email || '—' }}</dd>
          </div>
          <div>
            <dt class="text-brand-ink/45">Telefone</dt>
            <dd class="mt-0.5 text-brand-ink">{{ contact.mobile || '—' }}</dd>
          </div>
          <div>
            <dt class="text-brand-ink/45">WhatsApp</dt>
            <dd class="mt-0.5 text-brand-ink">{{ contact.whatsapp_jid || '—' }}</dd>
          </div>
          <div>
            <dt class="text-brand-ink/45">Empresa</dt>
            <dd class="mt-0.5 text-brand-ink">{{ contact.organization?.name || '—' }}</dd>
          </div>
        </dl>

        <div class="mt-6 flex justify-end">
          <Button variant="secondary" @click="close">Fechar</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
