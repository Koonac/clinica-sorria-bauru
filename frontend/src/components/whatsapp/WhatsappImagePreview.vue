<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'

const props = withDefaults(
  defineProps<{
    src: string
    alt?: string
  }>(),
  {
    alt: 'Imagem',
  },
)

const open = ref(false)

function openLightbox() {
  open.value = true
}

function closeLightbox() {
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    closeLightbox()
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onKeydown)
    document.body.style.overflow = 'hidden'
  } else {
    document.removeEventListener('keydown', onKeydown)
    document.body.style.overflow = ''
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <button
    type="button"
    class="block size-52 shrink-0 overflow-hidden rounded-xl bg-brand-ink/[0.06] outline-none transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-brand-cyan/40"
    :aria-label="`Ampliar ${alt}`"
    @click="openLightbox"
  >
    <img :src="src" :alt="alt" class="size-full object-fit" draggable="false" />
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="alt"
      @click.self="closeLightbox"
    >
      <button
        type="button"
        class="absolute top-4 right-4 inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        aria-label="Fechar"
        @click="closeLightbox"
      >
        <Icon icon="lucide:x" class="size-6" aria-hidden="true" />
      </button>

      <img
        :src="src"
        :alt="alt"
        class="max-h-[min(100vh-2rem,100%)] max-w-[min(100vw-2rem,100%)] object-contain"
        draggable="false"
        @click.stop
      />
    </div>
  </Teleport>
</template>
