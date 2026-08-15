<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { ApiError } from '@/api/client'
import { listAttendants } from '@/api/crm/attendants'
import { pauseLeadAgent, resumeLeadAgent, finalizeLeadWhatsapp, updateLead } from '@/api/crm/leads'
import { listWhatsappChats, markWhatsappChatRead } from '@/api/crm/whatsapp'
import type { CrmAttendant, WhatsappChat, WhatsappChatFilter } from '@/api/crm/types'
import WhatsappChatList from '@/components/whatsapp/WhatsappChatList.vue'
import WhatsappConversationHeader from '@/components/whatsapp/WhatsappConversationHeader.vue'
import WhatsappLeadSidebar from '@/components/whatsapp/WhatsappLeadSidebar.vue'
import WhatsappThread from '@/components/whatsapp/WhatsappThread.vue'
import { useAuthStore } from '@/stores/auth'
import { useClinicsStore } from '@/stores/clinics'

const auth = useAuthStore()
const clinics = useClinicsStore()

const INITIAL_LIMIT = 20
const MORE_LIMIT = 10

const chats = ref<WhatsappChat[]>([])
const attendants = ref<CrmAttendant[]>([])
const selected = ref<WhatsappChat | null>(null)
const leadSidebarOpen = ref(false)
const search = ref('')
const filter = ref<WhatsappChatFilter>('mine')
const loading = ref(true)
const loadingMore = ref(false)
const hasMore = ref(false)
const actionBusy = ref(false)
const errorMessage = ref('')
let listPoll: ReturnType<typeof setInterval> | null = null
let searchDebounce: ReturnType<typeof setTimeout> | null = null

function syncSelected(next: WhatsappChat[]) {
  if (!selected.value) return
  const match = next.find(
    (c) =>
      c.whatsapp_jid === selected.value?.whatsapp_jid ||
      c.conversation_key === selected.value?.conversation_key,
  )
  if (match) {
    selected.value = {
      ...match,
      avatar_url: selected.value.avatar_url || match.avatar_url,
    }
  }
}

async function loadChats(silent = false) {
  if (!silent) loading.value = true
  try {
    const limit = silent ? Math.max(INITIAL_LIMIT, chats.value.length) : INITIAL_LIMIT
    const page = await listWhatsappChats({
      search: search.value.trim() || undefined,
      filter: filter.value,
      limit,
      offset: 0,
    })
    chats.value = page.data
    hasMore.value = page.has_more
    syncSelected(page.data)
    if (!silent) errorMessage.value = ''
  } catch (e) {
    if (!silent) {
      errorMessage.value =
        e instanceof ApiError ? e.message : 'Não foi possível carregar as conversas.'
    }
  } finally {
    loading.value = false
  }
}

async function loadMoreChats() {
  if (loading.value || loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    const page = await listWhatsappChats({
      search: search.value.trim() || undefined,
      filter: filter.value,
      limit: MORE_LIMIT,
      offset: chats.value.length,
    })
    const seen = new Set(
      chats.value.map((c) => c.conversation_key || c.whatsapp_jid),
    )
    const appended = page.data.filter(
      (c) => !seen.has(c.conversation_key || c.whatsapp_jid),
    )
    chats.value = [...chats.value, ...appended]
    hasMore.value = page.has_more
  } catch (e) {
    errorMessage.value =
      e instanceof ApiError ? e.message : 'Não foi possível carregar mais conversas.'
  } finally {
    loadingMore.value = false
  }
}

async function loadAttendants() {
  try {
    attendants.value = await listAttendants()
  } catch {
    attendants.value = []
  }
}

async function selectChat(chat: WhatsappChat) {
  const next = { ...chat }
  if (next.contact_id && !next.avatar_url) {
    next.avatar_url = `/v1/crm/whatsapp/avatars/${next.contact_id}`
  }
  selected.value = next
  if (!next.lead_id) leadSidebarOpen.value = false
  try {
    await markWhatsappChatRead({
      jid: chat.whatsapp_jid,
      lead_id: chat.lead_id,
    })
    next.unread_count = 0
    chats.value = chats.value.map((c) =>
      c.conversation_key === chat.conversation_key || c.whatsapp_jid === chat.whatsapp_jid
        ? { ...c, unread_count: 0, avatar_url: next.avatar_url ?? c.avatar_url }
        : c,
    )
  } catch {
    // leitura é best-effort
  }
}

async function assumeChat() {
  if (!selected.value?.lead_id || !auth.user?.id || actionBusy.value) return
  actionBusy.value = true
  errorMessage.value = ''
  try {
    const lead = await updateLead(selected.value.lead_id, { owner_id: auth.user.id })
    selected.value = {
      ...selected.value,
      owner_id: lead.owner_id ?? auth.user.id,
      owner_name: auth.user.name,
      whatsapp_agent_paused_at: lead.whatsapp_agent_paused_at ?? selected.value.whatsapp_agent_paused_at,
      whatsapp_agent_resume_at: lead.whatsapp_agent_resume_at ?? null,
    }
    await loadChats(true)
  } catch (e) {
    errorMessage.value = e instanceof ApiError ? e.message : 'Não foi possível assumir.'
  } finally {
    actionBusy.value = false
  }
}

async function transferChat(ownerId: number) {
  if (!selected.value?.lead_id || actionBusy.value) return
  actionBusy.value = true
  errorMessage.value = ''
  try {
    const lead = await updateLead(selected.value.lead_id, { owner_id: ownerId })
    const attendant = attendants.value.find((a) => a.id === ownerId)
    selected.value = {
      ...selected.value,
      owner_id: lead.owner_id ?? ownerId,
      owner_name: attendant?.name ?? lead.owner?.name ?? null,
      whatsapp_agent_paused_at: lead.whatsapp_agent_paused_at ?? selected.value.whatsapp_agent_paused_at,
      whatsapp_agent_resume_at: lead.whatsapp_agent_resume_at ?? null,
    }
    await loadChats(true)
  } catch (e) {
    errorMessage.value = e instanceof ApiError ? e.message : 'Não foi possível transferir.'
  } finally {
    actionBusy.value = false
  }
}

async function pauseAgent() {
  if (!selected.value?.lead_id || actionBusy.value) return
  actionBusy.value = true
  try {
    const lead = await pauseLeadAgent(selected.value.lead_id)
    selected.value = {
      ...selected.value,
      whatsapp_agent_paused_at: lead.whatsapp_agent_paused_at ?? new Date().toISOString(),
      whatsapp_agent_resume_at: lead.whatsapp_agent_resume_at ?? null,
    }
    await loadChats(true)
  } catch (e) {
    errorMessage.value = e instanceof ApiError ? e.message : 'Não foi possível pausar o agent.'
  } finally {
    actionBusy.value = false
  }
}

async function resumeAgent() {
  if (!selected.value?.lead_id || actionBusy.value) return
  actionBusy.value = true
  try {
    await resumeLeadAgent(selected.value.lead_id)
    selected.value = {
      ...selected.value,
      whatsapp_agent_paused_at: null,
      whatsapp_agent_resume_at: null,
    }
    await loadChats(true)
  } catch (e) {
    errorMessage.value = e instanceof ApiError ? e.message : 'Não foi possível retomar o agent.'
  } finally {
    actionBusy.value = false
  }
}

async function finalizeChat() {
  if (!selected.value?.lead_id || actionBusy.value) return
  actionBusy.value = true
  errorMessage.value = ''
  try {
    const lead = await finalizeLeadWhatsapp(selected.value.lead_id)
    selected.value = {
      ...selected.value,
      owner_id: null,
      owner_name: null,
      whatsapp_agent_paused_at: lead.whatsapp_agent_paused_at ?? null,
      whatsapp_agent_resume_at: lead.whatsapp_agent_resume_at ?? null,
    }
    await loadChats(true)
  } catch (e) {
    errorMessage.value =
      e instanceof ApiError ? e.message : 'Não foi possível finalizar a conversa.'
  } finally {
    actionBusy.value = false
  }
}

async function renameLead(name: string) {
  if (!selected.value?.lead_id || actionBusy.value) return
  actionBusy.value = true
  errorMessage.value = ''
  try {
    const lead = await updateLead(selected.value.lead_id, { name })
    selected.value = {
      ...selected.value,
      contact_name: lead.name || name,
    }
    chats.value = chats.value.map((c) =>
      c.lead_id === selected.value?.lead_id || c.whatsapp_jid === selected.value?.whatsapp_jid
        ? { ...c, contact_name: lead.name || name }
        : c,
    )
  } catch (e) {
    errorMessage.value = e instanceof ApiError ? e.message : 'Não foi possível renomear o lead.'
  } finally {
    actionBusy.value = false
  }
}

function onSent() {
  void loadChats(true)
}

function onThreadAssumed(ownerId: number) {
  if (!selected.value || !auth.user) return
  selected.value = {
    ...selected.value,
    owner_id: ownerId,
    owner_name: auth.user.name,
  }
  void loadChats(true)
}

function toggleLeadSidebar() {
  if (!selected.value?.lead_id) return
  leadSidebarOpen.value = !leadSidebarOpen.value
}

function startListPoll() {
  stopListPoll()
  listPoll = setInterval(() => {
    void loadChats(true)
  }, 4000)
}

function stopListPoll() {
  if (listPoll) {
    clearInterval(listPoll)
    listPoll = null
  }
}

watch(filter, () => {
  void loadChats()
})

watch(search, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    void loadChats()
  }, 300)
})

watch(
  () => clinics.activeClinicId,
  () => {
    selected.value = null
    leadSidebarOpen.value = false
    void loadChats()
    void loadAttendants()
  },
)

onMounted(() => {
  void loadChats()
  void loadAttendants()
  startListPoll()
})

onUnmounted(() => {
  stopListPoll()
  if (searchDebounce) clearTimeout(searchDebounce)
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-brand-ink/10 bg-white">
    <p
      v-if="errorMessage"
      class="shrink-0 border-b border-brand-ink/10 bg-brand-ink/[0.03] px-4 py-2 text-sm text-brand-ink"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <div class="flex min-h-0 flex-1 flex-col md:flex-row">
      <WhatsappChatList
        v-model:search="search"
        v-model:filter="filter"
        :chats="chats"
        :loading="loading"
        :loading-more="loadingMore"
        :has-more="hasMore"
        :selected-jid="selected?.whatsapp_jid"
        @select="selectChat"
        @load-more="loadMoreChats"
      />

      <section class="flex min-h-0 min-w-0 flex-1 flex-col">
        <template v-if="selected">
          <WhatsappConversationHeader
            :chat="selected"
            :attendants="attendants"
            :busy="actionBusy"
            :lead-sidebar-open="leadSidebarOpen"
            @assume="assumeChat"
            @transfer="transferChat"
            @pause-agent="pauseAgent"
            @resume-agent="resumeAgent"
            @finalize="finalizeChat"
            @toggle-lead-sidebar="toggleLeadSidebar"
            @rename="renameLead"
          />
          <div class="flex min-h-0 flex-1 flex-col md:flex-row">
            <div class="flex min-h-0 min-w-0 flex-1 flex-col p-3 md:p-4">
              <WhatsappThread
                :jid="selected.whatsapp_jid"
                :lead-id="selected.lead_id"
                :deal-id="selected.deal_id"
                :contact-name="selected.contact_name"
                :owner-id="selected.owner_id"
                :owner-name="selected.owner_name"
                :poll-ms="3000"
                @sent="onSent"
                @assumed="onThreadAssumed"
                @error="errorMessage = $event"
              />
            </div>
            <WhatsappLeadSidebar
              v-if="leadSidebarOpen && selected.lead_id"
              :key="`${selected.lead_id}-${selected.owner_id ?? 'none'}-${selected.whatsapp_agent_paused_at ?? 'active'}-${selected.contact_name || ''}`"
              :lead-id="selected.lead_id"
              @close="leadSidebarOpen = false"
            />
          </div>
        </template>
        <div
          v-else
          class="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-brand-ink/45"
        >
          <p class="text-sm">Selecione uma conversa para atender.</p>
          <p class="text-xs">Vários atendentes compartilham a mesma linha da clínica.</p>
        </div>
      </section>
    </div>
  </div>
</template>
