<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { Contact } from '@/api/crm/types'
import ContentSkeleton from '@/components/Feedback/ContentSkeleton.vue'

defineProps<{
  contacts: Contact[]
  loading: boolean
  error: string
  search: string
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  search: []
  open: [contact: Contact]
}>()
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4">
    <form
      class="flex flex-wrap items-center gap-2"
      @submit.prevent="emit('search')"
    >
      <label class="relative min-w-[16rem] flex-1">
        <Icon
          icon="lucide:search"
          class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-brand-ink/35"
          aria-hidden="true"
        />
        <input
          :value="search"
          type="search"
          placeholder="Buscar contatos…"
          class="w-full rounded-xl border border-brand-ink/15 bg-white py-2.5 pr-4 pl-10 text-sm text-brand-ink outline-none focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
          @input="emit('update:search', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <button
        type="submit"
        class="rounded-full border border-brand-ink/15 bg-white px-4 py-2.5 text-sm font-medium text-brand-ink/70 hover:bg-[#f4f6f8]"
      >
        Buscar
      </button>
    </form>

    <p v-if="error" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </p>

    <ContentSkeleton v-if="loading" variant="table" :rows="8" />

    <div
      v-else
      class="min-h-0 flex-1 overflow-auto rounded-2xl border border-brand-ink/10 bg-white"
    >
      <table class="w-full min-w-[40rem] border-collapse text-left text-sm">
        <thead class="sticky top-0 bg-white">
          <tr class="border-b border-brand-ink/10 text-[0.7rem] tracking-wider text-brand-ink/45 uppercase">
            <th class="px-4 py-3 font-medium">Nome</th>
            <th class="px-4 py-3 font-medium">E-mail</th>
            <th class="px-4 py-3 font-medium">Telefone</th>
            <th class="px-4 py-3 font-medium">Empresa</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!contacts.length">
            <td colspan="4" class="px-4 py-10 text-center text-brand-ink/50">
              Nenhum contato encontrado.
            </td>
          </tr>
          <tr
            v-for="c in contacts"
            :key="c.id"
            class="cursor-pointer border-b border-brand-ink/5 transition hover:bg-[#f4f6f8]"
            @click="emit('open', c)"
          >
            <td class="px-4 py-3 font-medium text-brand-ink">{{ c.name }}</td>
            <td class="px-4 py-3 text-brand-ink/65">{{ c.email || '—' }}</td>
            <td class="px-4 py-3 text-brand-ink/65">{{ c.mobile || '—' }}</td>
            <td class="px-4 py-3 text-brand-ink/65">{{ c.organization?.name || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
