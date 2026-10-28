<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import type { CrmNotification, CrmNotificationType } from '@/api/crm/notifications'
import { useNotificationsStore } from '@/stores/notifications'
import { formatDateTime } from '@/utils/crmFormat'

const store = useNotificationsStore()
const router = useRouter()
const open = ref(false)

const TYPE_ICON: Record<CrmNotificationType, string> = {
  pre_agendamento: 'lucide:calendar-plus',
  urgencia: 'lucide:siren',
  reclamacao: 'lucide:message-square-warning',
  pedido_humano: 'lucide:hand',
  handoff: 'lucide:user-round',
  consulta_cancelada: 'lucide:calendar-x',
  consulta_confirmada: 'lucide:calendar-check',
}

function iconTone(n: CrmNotification): string {
  if (n.priority === 'urgent') return 'bg-red-50 text-red-700'
  if (n.type === 'pre_agendamento' || n.type === 'consulta_confirmada')
    return 'bg-emerald-50 text-emerald-700'
  return 'bg-brand-cyan/15 text-brand-cyan-ink'
}

async function openNotification(n: CrmNotification) {
  void store.markRead(n)
  open.value = false
  if (
    n.type === 'pre_agendamento' ||
    n.type === 'consulta_cancelada' ||
    n.type === 'consulta_confirmada'
  ) {
    await router.push({
      name: 'appointments',
      query: { tab: n.type === 'pre_agendamento' ? 'pre_booking' : 'upcoming' },
    })
  } else if (n.lead_id) {
    await router.push({ name: 'whatsapp', query: { lead: n.lead_id } })
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    open.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onKeydown)
    void store.refresh()
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <button
    type="button"
    class="relative inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-brand-ink/10 text-brand-ink/55 transition hover:border-brand-ink/20 hover:bg-[#f4f6f8] hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
    :class="store.hasUrgentUnread ? 'border-red-200 text-red-700' : ''"
    :title="store.unreadCount ? `${store.unreadCount} aviso(s) não lido(s)` : 'Avisos'"
    :aria-label="store.unreadCount ? `Avisos: ${store.unreadCount} não lidos` : 'Avisos'"
    aria-haspopup="dialog"
    :aria-expanded="open"
    @click="open = true"
  >
    <Icon
      icon="lucide:bell"
      class="size-5"
      :class="store.hasUrgentUnread ? 'animate-pulse' : ''"
      aria-hidden="true"
    />
    <span
      v-if="store.unreadCount > 0"
      class="absolute -top-1.5 -right-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] leading-5 font-semibold text-white"
      :class="store.hasUrgentUnread ? 'bg-red-600' : 'bg-brand-blue'"
    >
      {{ store.unreadCount > 99 ? '99+' : store.unreadCount }}
    </span>
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[60] flex justify-end bg-black/40 backdrop-blur-[1px]"
      role="presentation"
      v-backdrop-close="() => (open = false)"
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-title"
        class="animate-fade-up flex h-full w-full max-w-sm flex-col border-l border-brand-ink/10 bg-white shadow-2xl"
      >
        <header class="flex shrink-0 items-center gap-2 border-b border-brand-ink/10 px-4 py-4">
          <h2 id="notifications-title" class="flex-1 text-lg font-semibold text-brand-ink">
            Avisos
          </h2>
          <button
            v-if="store.unreadCount > 0"
            type="button"
            class="cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium text-brand-cyan-ink transition hover:bg-brand-cyan/10"
            @click="store.markAllRead()"
          >
            Marcar todos como lidos
          </button>
          <button
            type="button"
            class="inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-brand-ink/55 transition hover:bg-[#f4f6f8] hover:text-brand-ink"
            aria-label="Fechar"
            @click="open = false"
          >
            <Icon icon="lucide:x" class="size-[18px]" aria-hidden="true" />
          </button>
        </header>

        <p v-if="store.items.length === 0" class="p-5 text-sm text-brand-ink/55">
          Nenhum aviso por aqui. Pré-agendamentos, urgências e pedidos de atendimento aparecem nesta
          lista.
        </p>

        <ul v-else class="min-h-0 flex-1 overflow-y-auto p-2">
          <li v-for="n in store.items" :key="n.id">
            <button
              type="button"
              class="flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[#f4f6f8]"
              :class="n.read_at ? 'opacity-60' : ''"
              @click="openNotification(n)"
            >
              <span
                class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg"
                :class="iconTone(n)"
                aria-hidden="true"
              >
                <Icon :icon="TYPE_ICON[n.type] ?? 'lucide:bell'" class="size-[18px]" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-start gap-2">
                  <span class="min-w-0 flex-1 text-sm font-medium text-brand-ink">{{
                    n.title
                  }}</span>
                  <span
                    v-if="!n.read_at"
                    class="mt-1.5 size-2 shrink-0 rounded-full bg-brand-blue"
                    aria-label="Não lido"
                  />
                </span>
                <span
                  v-if="n.body"
                  class="mt-0.5 line-clamp-3 block text-xs whitespace-pre-line text-brand-ink/60"
                >
                  {{ n.body }}
                </span>
                <span class="mt-1 block text-[11px] text-brand-ink/40">
                  {{ n.lead_name ? `${n.lead_name} · ` : '' }}{{ formatDateTime(n.created_at) }}
                </span>
              </span>
            </button>
          </li>
        </ul>
      </aside>
    </div>
  </Teleport>
</template>
