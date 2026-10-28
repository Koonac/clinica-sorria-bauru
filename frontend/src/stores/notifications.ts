import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type CrmNotification,
} from '@/api/crm/notifications'
import { playTransferSound, unlockTransferSound } from '@/utils/playTransferSound'

const POLL_MS = 15_000

/**
 * Avisos da recepção (pré-agendamento, urgência, handoff…). Um único polling para o app todo.
 */
export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<CrmNotification[]>([])
  const unreadCount = ref(0)
  const loaded = ref(false)

  let timer: ReturnType<typeof setInterval> | null = null
  let lastSeenId = 0
  let unlockBound = false

  const hasUrgentUnread = computed(() =>
    items.value.some((n) => n.priority === 'urgent' && !n.read_at),
  )

  async function refresh() {
    try {
      const result = await listNotifications({ limit: 30 })
      const newest = result.data[0]?.id ?? 0

      // Só toca para avisos novos não lidos (nunca no primeiro carregamento).
      if (loaded.value && newest > lastSeenId) {
        const fresh = result.data.filter((n) => n.id > lastSeenId && !n.read_at)
        if (fresh.length > 0) playTransferSound()
      }

      lastSeenId = Math.max(lastSeenId, newest)
      items.value = result.data
      unreadCount.value = result.meta.unread_count
      loaded.value = true
    } catch {
      // Polling silencioso: tenta de novo no próximo ciclo.
    }
  }

  function start() {
    if (timer) return
    void refresh()
    timer = setInterval(() => void refresh(), POLL_MS)
    if (!unlockBound) {
      unlockBound = true
      document.addEventListener('pointerdown', () => void unlockTransferSound(), { once: true })
    }
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
    items.value = []
    unreadCount.value = 0
    loaded.value = false
    lastSeenId = 0
  }

  async function markRead(notification: CrmNotification) {
    if (notification.read_at) return
    notification.read_at = new Date().toISOString()
    unreadCount.value = Math.max(0, unreadCount.value - 1)
    try {
      await markNotificationRead(notification.id)
    } catch {
      void refresh()
    }
  }

  async function markAllRead() {
    const now = new Date().toISOString()
    items.value.forEach((n) => {
      if (!n.read_at) n.read_at = now
    })
    unreadCount.value = 0
    try {
      await markAllNotificationsRead()
    } catch {
      void refresh()
    }
  }

  return {
    items,
    unreadCount,
    loaded,
    hasUrgentUnread,
    refresh,
    start,
    stop,
    markRead,
    markAllRead,
  }
})
