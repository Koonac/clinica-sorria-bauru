<script setup lang="ts">
withDefaults(
  defineProps<{
    eyebrow?: string
    title: string
    description?: string
  }>(),
  {
    eyebrow: undefined,
    description: undefined,
  },
)
</script>

<template>
  <div class="flex h-full min-h-0 w-full flex-col gap-5 p-5 md:p-8">
    <header
      class="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div class="min-w-0">
        <p
          v-if="eyebrow"
          class="text-[0.7rem] font-medium tracking-[0.24em] text-brand-cyan-ink uppercase"
        >
          {{ eyebrow }}
        </p>
        <h1
          class="text-2xl font-semibold tracking-tight text-brand-ink md:text-3xl"
          :class="eyebrow ? 'mt-2' : ''"
        >
          {{ title }}
        </h1>
        <p v-if="description" class="mt-2 text-sm leading-relaxed text-brand-ink/60">
          {{ description }}
        </p>
        <div v-if="$slots.description" class="mt-2">
          <slot name="description" />
        </div>
      </div>

      <div
        v-if="$slots.actions"
        class="flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-auto"
      >
        <slot name="actions" />
      </div>
    </header>

    <div class="flex min-h-0 flex-1 flex-col gap-5">
      <slot />
    </div>
  </div>
</template>
