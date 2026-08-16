<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { api } from '@/api/client'
import type { WhatsappMessage } from '@/api/crm/types'

const props = defineProps<{
  message: WhatsappMessage
}>()

const blobUrl = ref<string | null>(null)
const loading = ref(false)
const failed = ref(false)
let requestId = 0

const mimetype = computed(() => (props.message.media?.mimetype || '').toLowerCase())

const kind = computed<'image' | 'audio' | 'file'>(() => {
  if (mimetype.value.startsWith('image/')) return 'image'
  if (mimetype.value.startsWith('audio/')) return 'audio'
  if (props.message.type === 'image' || props.message.type === 'sticker') return 'image'
  if (props.message.type === 'audio' || props.message.type === 'ptt') return 'audio'
  return 'file'
})

const fileLabel = computed(() => props.message.media?.filename || 'Arquivo recebido')

function revoke() {
  if (blobUrl.value) {
    URL.revokeObjectURL(blobUrl.value)
    blobUrl.value = null
  }
}

async function load() {
  const id = ++requestId
  revoke()
  failed.value = false

  const url = props.message.media_url
  if (!url) {
    failed.value = true
    return
  }

  loading.value = true
  try {
    const { data } = await api.get<Blob>(url, { responseType: 'blob' })
    if (id !== requestId) return
    if (!data || data.size === 0) {
      failed.value = true
      return
    }
    blobUrl.value = URL.createObjectURL(data)
  } catch {
    if (id === requestId) failed.value = true
  } finally {
    if (id === requestId) loading.value = false
  }
}

watch(
  () => props.message.media_url,
  () => {
    void load()
  },
  { immediate: true },
)

onUnmounted(() => {
  requestId++
  revoke()
})
</script>

<template>
  <div class="mb-1.5">
    <div
      v-if="loading"
      class="flex items-center gap-2 rounded-xl bg-brand-ink/[0.06] px-3 py-2 text-xs text-brand-ink/55"
    >
      <Icon icon="lucide:loader-circle" class="size-4 animate-spin" aria-hidden="true" />
      Carregando mídia…
    </div>

    <div
      v-else-if="failed || !blobUrl"
      class="flex items-center gap-2 rounded-xl bg-brand-ink/[0.06] px-3 py-2 text-xs text-brand-ink/55"
    >
      <Icon icon="lucide:file-x" class="size-4" aria-hidden="true" />
      Mídia indisponível
    </div>

    <img
      v-else-if="kind === 'image'"
      :src="blobUrl"
      :alt="fileLabel"
      class="max-h-72 w-full rounded-xl object-cover"
      @error="failed = true"
    />

    <audio v-else-if="kind === 'audio'" :src="blobUrl" controls class="w-64 max-w-full" />

    <a
      v-else
      :href="blobUrl"
      :download="fileLabel"
      class="flex items-center gap-2 rounded-xl bg-brand-ink/[0.06] px-3 py-2 text-xs font-medium text-brand-ink/70 transition hover:bg-brand-ink/10"
    >
      <Icon icon="lucide:paperclip" class="size-4" aria-hidden="true" />
      {{ fileLabel }}
    </a>
  </div>
</template>
