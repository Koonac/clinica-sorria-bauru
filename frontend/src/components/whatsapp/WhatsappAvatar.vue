<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { api } from '@/api/client'

const props = withDefaults(
  defineProps<{
    src?: string | null
    label: string
    sizeClass?: string
  }>(),
  {
    src: null,
    sizeClass: 'size-10 text-sm',
  },
)

const blobUrl = ref<string | null>(null)
const failed = ref(false)
let requestId = 0

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

  const path = props.src?.trim()
  if (!path) {
    failed.value = true
    return
  }

  try {
    const { data } = await api.get<Blob>(path, { responseType: 'blob' })
    if (id !== requestId) return
    if (!data || data.size === 0 || !String(data.type || '').startsWith('image/')) {
      failed.value = true
      return
    }
    blobUrl.value = URL.createObjectURL(data)
  } catch {
    if (id === requestId) failed.value = true
  }
}

watch(
  () => props.src,
  () => {
    void load()
  },
  { immediate: true },
)

onUnmounted(() => {
  requestId++
  revoke()
})

const initial = () => (props.label.trim().slice(0, 1) || '?').toUpperCase()
</script>

<template>
  <div
    class="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-ink/10 font-semibold text-brand-ink"
    :class="sizeClass"
    aria-hidden="true"
  >
    <img
      v-if="blobUrl && !failed"
      :src="blobUrl"
      alt=""
      class="size-full object-cover"
      @error="failed = true"
    />
    <span v-else>{{ initial() }}</span>
  </div>
</template>
