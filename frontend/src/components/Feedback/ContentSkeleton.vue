<script setup lang="ts">
import Skeleton from '@/components/Feedback/Skeleton.vue'

withDefaults(
  defineProps<{
    /** Layout aproximado do conteúdo que será carregado */
    variant?: 'table' | 'kanban' | 'dashboard' | 'calendar' | 'cards' | 'detail'
    /** Linhas extras (table / detail) */
    rows?: number
  }>(),
  {
    variant: 'table',
    rows: 6,
  },
)
</script>

<template>
  <div class="w-full" role="status" aria-live="polite" aria-busy="true">
    <span class="sr-only">Carregando conteúdo…</span>

    <!-- Tabela -->
    <div
      v-if="variant === 'table'"
      class="overflow-hidden rounded-2xl border border-brand-ink/10 bg-white"
    >
      <div class="flex gap-4 border-b border-brand-ink/10 bg-[#f8fafb] px-4 py-3">
        <Skeleton class="h-3 w-20 rounded-md" />
        <Skeleton class="h-3 w-24 rounded-md" />
        <Skeleton class="hidden h-3 w-28 rounded-md sm:block" />
        <Skeleton class="ml-auto hidden h-3 w-16 rounded-md sm:block" />
      </div>
      <div
        v-for="i in rows"
        :key="i"
        class="flex items-center gap-4 border-b border-brand-ink/5 px-4 py-3.5 last:border-0"
      >
        <Skeleton class="h-3.5 w-[28%] max-w-[10rem] rounded-md" />
        <Skeleton class="h-3.5 w-[22%] max-w-[8rem] rounded-md" />
        <Skeleton class="hidden h-3.5 w-[30%] max-w-[12rem] rounded-md sm:block" />
        <Skeleton class="ml-auto h-8 w-16 rounded-lg" />
      </div>
    </div>

    <!-- Kanban -->
    <div v-else-if="variant === 'kanban'" class="flex min-h-[28rem] gap-3 overflow-x-auto pb-2">
      <div
        v-for="col in 4"
        :key="col"
        class="flex w-72 shrink-0 flex-col gap-3 rounded-2xl border border-brand-ink/10 bg-[#f8fafb] p-3"
      >
        <div class="flex items-center justify-between gap-2 px-1 py-1">
          <Skeleton class="h-4 w-28 rounded-md" />
          <Skeleton class="h-5 w-8 rounded-full" />
        </div>
        <div v-for="card in 3" :key="card" class="rounded-xl border border-brand-ink/8 bg-white p-3">
          <Skeleton class="h-3.5 w-[80%] rounded-md" />
          <Skeleton class="mt-2.5 h-3 w-1/2 rounded-md" />
          <div class="mt-3 flex gap-2">
            <Skeleton class="h-6 w-6 rounded-lg" />
            <Skeleton class="h-6 w-6 rounded-lg" />
          </div>
        </div>
      </div>
    </div>

    <!-- Dashboard -->
    <div v-else-if="variant === 'dashboard'" class="flex flex-col gap-5">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="i in 6"
          :key="i"
          class="rounded-2xl border border-brand-ink/10 bg-white px-4 py-4"
        >
          <Skeleton class="h-2.5 w-20 rounded-md" />
          <Skeleton class="mt-3 h-7 w-24 rounded-md" />
        </div>
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-2xl border border-brand-ink/10 bg-white p-4">
          <Skeleton class="h-4 w-40 rounded-md" />
          <Skeleton class="mt-4 h-56 w-full rounded-xl" />
        </div>
        <div class="rounded-2xl border border-brand-ink/10 bg-white p-4">
          <Skeleton class="h-4 w-44 rounded-md" />
          <Skeleton class="mt-4 h-56 w-full rounded-xl" />
        </div>
      </div>
    </div>

    <!-- Calendário -->
    <div
      v-else-if="variant === 'calendar'"
      class="overflow-hidden rounded-2xl border border-brand-ink/10 bg-white"
    >
      <div class="grid grid-cols-7 border-b border-brand-ink/10 bg-[#f8fafb]">
        <div v-for="i in 7" :key="i" class="flex justify-center px-2 py-2.5">
          <Skeleton class="h-2.5 w-8 rounded-md" />
        </div>
      </div>
      <div class="grid grid-cols-7 auto-rows-[minmax(6.5rem,1fr)]">
        <div
          v-for="i in 35"
          :key="i"
          class="flex min-h-[6.5rem] flex-col gap-1.5 border-r border-b border-brand-ink/8 p-2"
        >
          <Skeleton class="size-6 rounded-full" />
          <Skeleton v-if="i % 3 !== 0" class="mt-1 h-4 w-full rounded-md" />
          <Skeleton v-if="i % 5 === 0" class="h-4 w-[75%] rounded-md" />
        </div>
      </div>
    </div>

    <!-- Cards / formulários (ex.: WhatsApp) -->
    <div v-else-if="variant === 'cards'" class="grid gap-4 lg:grid-cols-2">
      <div
        v-for="card in 2"
        :key="card"
        class="flex flex-col gap-4 rounded-2xl border border-brand-ink/10 bg-white p-5"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 space-y-2">
            <Skeleton class="h-5 w-28 rounded-md" />
            <Skeleton class="h-3.5 w-48 max-w-full rounded-md" />
          </div>
          <Skeleton class="h-7 w-24 rounded-full" />
        </div>
        <div class="flex gap-2">
          <Skeleton class="h-10 w-28 rounded-full" />
          <Skeleton class="h-10 w-32 rounded-full" />
        </div>
        <div class="space-y-3 border-t border-brand-ink/10 pt-4">
          <Skeleton class="h-3.5 w-24 rounded-md" />
          <Skeleton class="h-11 w-full rounded-xl" />
          <Skeleton class="h-3.5 w-20 rounded-md" />
          <Skeleton class="h-11 w-full rounded-xl" />
          <Skeleton class="h-10 w-36 rounded-full" />
        </div>
      </div>
    </div>

    <!-- Detalhe (modal / painel) -->
    <div v-else class="space-y-4 py-2">
      <div class="grid gap-3 sm:grid-cols-2">
        <div v-for="i in rows" :key="i" class="space-y-2">
          <Skeleton class="h-3 w-16 rounded-md" />
          <Skeleton class="h-10 w-full rounded-xl" />
        </div>
      </div>
    </div>
  </div>
</template>
