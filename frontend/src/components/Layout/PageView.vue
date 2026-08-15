<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <div class="flex h-full min-h-0 w-full flex-col gap-4 p-5 md:p-6">
    <header class="flex shrink-0 items-center justify-between gap-3">
      <h1
        class="min-w-0 text-[0.7rem] font-medium tracking-[0.24em] text-brand-cyan-ink uppercase"
      >
        {{ title }}
      </h1>

      <div
        v-if="$slots.actions"
        class="flex shrink-0 flex-wrap items-center justify-end gap-2"
      >
        <slot name="actions" />
      </div>
    </header>

    <div class="flex min-h-0 flex-1 flex-col gap-4">
      <slot />
    </div>
  </div>
</template>
