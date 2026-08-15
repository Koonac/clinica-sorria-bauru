<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { WhatsappChat, WhatsappChatFilter } from '@/api/crm/types'
import Skeleton from '@/components/Feedback/Skeleton.vue'
import { formatDateTime } from '@/utils/crmFormat'

defineProps<{
  chats: WhatsappChat[]
  loading: boolean
  selectedJid?: string | null
  search: string
  filter: WhatsappChatFilter
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update:filter': [value: WhatsappChatFilter]
  select: [chat: WhatsappChat]
}>()

const filters: { id: WhatsappChatFilter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'mine', label: 'Minhas' },
  { id: 'unassigned', label: 'Sem dono' },
  { id: 'unread', label: 'Não lidas' },
  { id: 'human', label: 'Humano' },
]

function preview(chat: WhatsappChat): string {
  if (chat.last_message.has_media && !chat.last_message.body) return '[mídia]'
  return chat.last_message.body?.trim() || '—'
}

function title(chat: WhatsappChat): string {
  return chat.contact_name || chat.phone_number || chat.whatsapp_jid
}
</script>

<template>
  <aside class="flex min-h-0 w-full flex-col border-brand-ink/10 md:w-[22rem] md:border-r lg:w-[24rem]">
    <div class="shrink-0 space-y-2 border-b border-brand-ink/10 p-3">
      <div class="relative">
        <Icon
          icon="lucide:search"
          class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-brand-ink/35"
        />
        <input
          :value="search"
          type="search"
          placeholder="Buscar conversas…"
          class="w-full rounded-xl border border-brand-ink/10 bg-[#f4f6f8] py-2.5 pr-3 pl-9 text-sm text-brand-ink outline-none focus:border-brand-cyan"
          @input="emit('update:search', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="f in filters"
          :key="f.id"
          type="button"
          class="rounded-lg px-2.5 py-1 text-xs font-medium transition"
          :class="
            filter === f.id
              ? 'bg-brand-cyan/20 text-brand-ink'
              : 'bg-brand-ink/[0.04] text-brand-ink/55 hover:text-brand-ink'
          "
          @click="emit('update:filter', f.id)"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div v-if="loading" class="space-y-2 p-3" role="status" aria-busy="true">
        <Skeleton v-for="i in 8" :key="i" class="h-16 w-full rounded-xl" />
      </div>
      <p v-else-if="!chats.length" class="px-4 py-8 text-center text-sm text-brand-ink/45">
        Nenhuma conversa.
      </p>
      <button
        v-for="chat in chats"
        :key="chat.conversation_key || chat.whatsapp_jid"
        type="button"
        class="flex w-full items-start gap-3 border-b border-brand-ink/5 px-3 py-3 text-left transition hover:bg-[#f4f6f8]"
        :class="selectedJid === chat.whatsapp_jid ? 'bg-brand-cyan/10' : ''"
        @click="emit('select', chat)"
      >
        <div
          class="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-ink/10 text-sm font-semibold text-brand-ink"
        >
          {{ title(chat).slice(0, 1).toUpperCase() }}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <p class="truncate text-sm font-semibold text-brand-ink">{{ title(chat) }}</p>
            <span
              v-if="chat.unread_count > 0"
              class="inline-flex min-w-5 items-center justify-center rounded-full bg-brand-blue px-1.5 py-0.5 text-[10px] font-bold text-white"
            >
              {{ chat.unread_count > 99 ? '99+' : chat.unread_count }}
            </span>
          </div>
          <p class="mt-0.5 truncate text-xs text-brand-ink/55">{{ preview(chat) }}</p>
          <div class="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-brand-ink/40">
            <span>{{ formatDateTime(chat.last_message.wa_timestamp || chat.last_message.created_at) }}</span>
            <span v-if="chat.owner_name">· {{ chat.owner_name }}</span>
            <span
              v-if="chat.whatsapp_agent_paused_at"
              class="rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-800"
            >
              Humano
            </span>
          </div>
        </div>
      </button>
    </div>
  </aside>
</template>
