<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import {
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectViewport,
} from 'reka-ui'
import type { WhatsappChat, WhatsappChatFilter } from '@/api/crm/types'
import Skeleton from '@/components/Feedback/Skeleton.vue'
import WhatsappAvatar from '@/components/whatsapp/WhatsappAvatar.vue'
import { formatDateTime } from '@/utils/crmFormat'

const props = defineProps<{
  chats: WhatsappChat[]
  loading: boolean
  loadingMore?: boolean
  hasMore?: boolean
  selectedJid?: string | null
  search: string
  filter: WhatsappChatFilter
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update:filter': [value: WhatsappChatFilter]
  select: [chat: WhatsappChat]
  loadMore: []
}>()

const primaryFilters: { id: WhatsappChatFilter; label: string }[] = [
  { id: 'mine', label: 'Minhas' },
  { id: 'agent', label: 'Agent IA' },
  { id: 'all', label: 'Todas' },
]

const moreFilterIds: WhatsappChatFilter[] = ['unassigned', 'unread', 'human']

const moreOptions: { value: WhatsappChatFilter; label: string }[] = [
  { value: 'unassigned', label: 'Finalizados' },
  { value: 'unread', label: 'Não lidas' },
  { value: 'human', label: 'Humano' },
]

const moreValue = computed({
  get(): string {
    return moreFilterIds.includes(props.filter) ? props.filter : ''
  },
  set(value: string) {
    if (!value) return
    emit('update:filter', value as WhatsappChatFilter)
  },
})

const moreActive = computed(() => moreFilterIds.includes(props.filter))

function chipClass(id: WhatsappChatFilter): string {
  return props.filter === id
    ? 'bg-brand-cyan/20 text-brand-ink'
    : 'bg-brand-ink/[0.04] text-brand-ink/55 hover:text-brand-ink'
}

function preview(chat: WhatsappChat): string {
  if (chat.last_message.has_media && !chat.last_message.body) return '[mídia]'
  return chat.last_message.body?.trim() || '—'
}

function title(chat: WhatsappChat): string {
  return chat.contact_name || chat.phone_number || chat.whatsapp_jid
}

function isFinalized(chat: WhatsappChat): boolean {
  return Boolean(chat.lead_id) && Boolean(chat.whatsapp_conversation_closed_at)
}

function ownershipBadge(chat: WhatsappChat): { label: string; className: string } | null {
  if (isFinalized(chat)) {
    return {
      label: 'Finalizado',
      className: 'rounded bg-brand-ink/10 px-1.5 py-0.5 font-medium text-brand-ink/70',
    }
  }
  if (chat.whatsapp_agent_paused_at) {
    return {
      label: chat.owner_name || 'Humano',
      className: 'rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-800',
    }
  }
  if (chat.lead_id) {
    return {
      label: 'Agent IA',
      className: 'rounded bg-brand-cyan/15 px-1.5 py-0.5 font-medium text-brand-cyan-ink',
    }
  }
  return null
}

function onListScroll(event: Event) {
  const el = event.target as HTMLElement
  if (!props.hasMore || props.loading || props.loadingMore) return
  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
  if (remaining <= 80) {
    emit('loadMore')
  }
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

      <div class="flex flex-wrap items-center gap-1">
        <button
          v-for="f in primaryFilters"
          :key="f.id"
          type="button"
          class="rounded-lg px-2.5 py-1 text-xs font-medium transition"
          :class="chipClass(f.id)"
          @click="emit('update:filter', f.id)"
        >
          {{ f.label }}
        </button>

        <SelectRoot v-model="moreValue">
          <SelectTrigger
            class="group inline-flex size-7 items-center justify-center rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-brand-cyan/25"
            :class="
              moreActive
                ? 'bg-brand-cyan/20 text-brand-ink'
                : 'bg-brand-ink/[0.04] text-brand-ink/55 hover:text-brand-ink'
            "
            aria-label="Mais filtros"
          >
            <Icon
              icon="lucide:chevron-down"
              class="size-4 transition group-data-[state=open]:rotate-180"
              aria-hidden="true"
            />
          </SelectTrigger>

          <SelectPortal>
            <SelectContent
              position="popper"
              :side-offset="6"
              align="end"
              class="z-[80] min-w-[10rem] overflow-hidden rounded-xl border border-brand-ink/10 bg-white shadow-lg outline-none data-[state=open]:animate-fade-up"
            >
              <SelectViewport class="p-1">
                <SelectItem
                  v-for="option in moreOptions"
                  :key="option.value"
                  :value="option.value"
                  class="relative flex cursor-pointer items-center rounded-lg py-2 pr-8 pl-3 text-sm whitespace-nowrap text-brand-ink outline-none select-none data-[highlighted]:bg-[#f4f6f8] data-[state=checked]:font-medium"
                >
                  <SelectItemText>{{ option.label }}</SelectItemText>
                  <SelectItemIndicator
                    class="absolute right-2 inline-flex items-center text-brand-cyan-ink"
                  >
                    <Icon icon="lucide:check" class="size-4" aria-hidden="true" />
                  </SelectItemIndicator>
                </SelectItem>
              </SelectViewport>
            </SelectContent>
          </SelectPortal>
        </SelectRoot>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto" @scroll.passive="onListScroll">
      <div v-if="loading" class="space-y-2 p-3" role="status" aria-busy="true">
        <Skeleton v-for="i in 8" :key="i" class="h-16 w-full rounded-xl" />
      </div>
      <p v-else-if="!chats.length" class="px-4 py-8 text-center text-sm text-brand-ink/45">
        Nenhuma conversa.
      </p>
      <template v-else>
        <button
          v-for="chat in chats"
          :key="chat.conversation_key || chat.whatsapp_jid"
          type="button"
          class="flex w-full items-start gap-3 border-b border-brand-ink/5 px-3 py-3 text-left transition hover:bg-[#f4f6f8]"
          :class="selectedJid === chat.whatsapp_jid ? 'bg-brand-cyan/10' : ''"
          @click="emit('select', chat)"
        >
          <WhatsappAvatar :src="chat.avatar_url" :label="title(chat)" size-class="size-10 text-sm" />
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
              <span
                v-if="ownershipBadge(chat)"
                :class="ownershipBadge(chat)?.className"
              >
                {{ ownershipBadge(chat)?.label }}
              </span>
              <span v-else-if="chat.owner_name">· {{ chat.owner_name }}</span>
            </div>
          </div>
        </button>
        <div v-if="loadingMore" class="space-y-2 p-3" role="status" aria-busy="true">
          <Skeleton class="h-14 w-full rounded-xl" />
          <Skeleton class="h-14 w-full rounded-xl" />
        </div>
      </template>
    </div>
  </aside>
</template>
