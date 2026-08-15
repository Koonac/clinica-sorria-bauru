<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { ApiError } from '@/api/client'
import { listAttendants } from '@/api/crm/attendants'
import { pauseLeadAgent, resumeLeadAgent, updateLead } from '@/api/crm/leads'
import { listWhatsappChats, markWhatsappChatRead } from '@/api/crm/whatsapp'
import type { CrmAttendant, WhatsappChat, WhatsappChatFilter } from '@/api/crm/types'
import WhatsappChatList from '@/components/whatsapp/WhatsappChatList.vue'
import WhatsappConversationHeader from '@/components/whatsapp/WhatsappConversationHeader.vue'
import WhatsappThread from '@/components/whatsapp/WhatsappThread.vue'
import { useAuthStore } from '@/stores/auth'
import { useClinicsStore } from '@/stores/clinics'

const auth = useAuthStore()
const clinics = useClinicsStore()

const chats = ref<WhatsappChat[]>([])
const attendants = ref<CrmAttendant[]>([])
const selected = ref<WhatsappChat | null>(null)
const search = ref('')
const filter = ref<WhatsappChatFilter>('all')
const loading = ref(true)
const actionBusy = ref(false)
const errorMessage = ref('')
let listPoll: ReturnType<typeof setInterval> | null = null
let searchDebounce: ReturnType<typeof setTimeout> | null = null

async function loadChats(silent = false) {
  if (!silent) loading.value = true
  try {
    const next = await listWhatsappChats({
      search: search.value.trim() || undefined,
      filter: filter.value,
    })
    chats.value = next
    if (selected.value) {
      const match = next.find(
        (c) =>
          c.whatsapp_jid === selected.value?.whatsapp_jid ||
          c.conversation_key === selected.value?.conversation_key,
      )
      if (match) selected.value = match
    }
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

async function loadAttendants() {
  try {
    attendants.value = await listAttendants()
  } catch {
    attendants.value = []
  }
}

async function selectChat(chat: WhatsappChat) {
  selected.value = chat
  try {
    await markWhatsappChatRead({
      jid: chat.whatsapp_jid,
      lead_id: chat.lead_id,
    })
    chat.unread_count = 0
    chats.value = chats.value.map((c) =>
      c.conversation_key === chat.conversation_key || c.whatsapp_jid === chat.whatsapp_jid
        ? { ...c, unread_count: 0 }
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
    }
    await loadChats(true)
  } catch (e) {
    errorMessage.value = e instanceof ApiError ? e.message : 'Não foi possível retomar o agent.'
  } finally {
    actionBusy.value = false
  }
}

function onSent() {
  void loadChats(true)
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
        :selected-jid="selected?.whatsapp_jid"
        @select="selectChat"
      />

      <section class="flex min-h-0 min-w-0 flex-1 flex-col">
        <template v-if="selected">
          <WhatsappConversationHeader
            :chat="selected"
            :attendants="attendants"
            :busy="actionBusy"
            @assume="assumeChat"
            @transfer="transferChat"
            @pause-agent="pauseAgent"
            @resume-agent="resumeAgent"
          />
          <div class="flex min-h-0 flex-1 flex-col p-3 md:p-4">
            <WhatsappThread
              :jid="selected.whatsapp_jid"
              :lead-id="selected.lead_id"
              :deal-id="selected.deal_id"
              :contact-name="selected.contact_name"
              :poll-ms="3000"
              @sent="onSent"
              @error="errorMessage = $event"
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
