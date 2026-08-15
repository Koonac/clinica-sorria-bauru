<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { Picker, EmojiIndex } from 'emoji-mart-vue-fast/src'
import data from 'emoji-mart-vue-fast/data/all.json'
import 'emoji-mart-vue-fast/css/emoji-mart.css'
import { ApiError } from '@/api/client'
import { updateLead } from '@/api/crm/leads'
import { listWhatsappMessages, sendWhatsappMessage } from '@/api/crm/whatsapp'
import type { WhatsappMessage } from '@/api/crm/types'
import Button from '@/components/Buttons/Button.vue'
import Skeleton from '@/components/Feedback/Skeleton.vue'
import ConfirmModal from '@/components/Modals/ConfirmModal.vue'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime, inputClass } from '@/utils/crmFormat'
import { formatWhatsappText, whatsappSenderPrefix } from '@/utils/whatsappFormat'

type SendStatus = 'pending' | 'failed'

type ChatBubble = WhatsappMessage & {
  client_id?: string
  send_status?: SendStatus
}

const props = defineProps<{
  jid: string
  leadId?: number | null
  dealId?: number | null
  contactName?: string | null
  ownerId?: number | null
  ownerName?: string | null
  pollMs?: number
}>()

const emit = defineEmits<{
  sent: [message: WhatsappMessage]
  assumed: [ownerId: number]
  error: [message: string]
}>()

const auth = useAuthStore()
const emojiIndex = new EmojiIndex(data)

const emojiI18n = {
  search: 'Buscar',
  notfound: 'Nenhum emoji encontrado',
  categories: {
    search: 'Resultados da busca',
    recent: 'Mais usados',
    smileys: 'Smileys e emoções',
    people: 'Pessoas e corpo',
    nature: 'Animais e natureza',
    foods: 'Comida e bebida',
    activity: 'Atividades',
    places: 'Viagem e lugares',
    objects: 'Objetos',
    symbols: 'Símbolos',
    flags: 'Bandeiras',
    custom: 'Personalizados',
  },
}

const messages = ref<ChatBubble[]>([])
const text = ref('')
const loading = ref(true)
const showEmoji = ref(false)
const scroller = ref<HTMLElement | null>(null)
const composerRef = ref<HTMLElement | null>(null)
const assumeOpen = ref(false)
const assumeBusy = ref(false)
const pendingBody = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null
let localSeq = 0

const needsAssumeConfirm = computed(() => {
  if (!props.leadId || !auth.user?.id) return false
  return props.ownerId !== auth.user.id
})

const assumeMessage = computed(() => {
  if (props.ownerName) {
    return `Este cliente está com ${props.ownerName}. Deseja assumir o atendimento antes de enviar?`
  }
  return 'Este cliente não está atribuído a você. Deseja assumir o atendimento antes de enviar?'
})

function formatOutboundBody(raw: string): string {
  const name = auth.user?.name?.trim()
  return name ? `${whatsappSenderPrefix(name)}${raw}` : raw
}

function bubbleHtml(body: string | null | undefined, hasMedia?: boolean): string {
  const text = body || (hasMedia ? '[mídia]' : '')
  return formatWhatsappText(text)
}

function onComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  if (event.shiftKey) return
  event.preventDefault()
  requestSend()
}

function isOutbound(direction: string): boolean {
  return direction === 'out' || direction === 'outbound'
}

function bubbleKey(m: ChatBubble): string | number {
  return m.client_id || m.id
}

async function scrollToBottom() {
  await nextTick()
  if (scroller.value) {
    scroller.value.scrollTop = scroller.value.scrollHeight
  }
}

function sortMessages(list: ChatBubble[]): ChatBubble[] {
  return [...list].sort((a, b) => {
    const ta = new Date(a.wa_timestamp || a.created_at || 0).getTime()
    const tb = new Date(b.wa_timestamp || b.created_at || 0).getTime()
    if (ta !== tb) return ta - tb
    return (a.id || 0) - (b.id || 0)
  })
}

function mergeWithLocals(server: WhatsappMessage[]): ChatBubble[] {
  const locals = messages.value.filter((m) => m.send_status === 'pending' || m.send_status === 'failed')
  const kept = locals.filter((local) => {
    const body = (local.body || '').trim()
    if (!body) return true
    return !server.some(
      (s) => isOutbound(s.direction) && (s.body || '').trim() === body,
    )
  })
  return sortMessages([...server, ...kept])
}

async function load(silent = false) {
  if (!props.jid) return
  if (!silent) loading.value = true
  try {
    const prevLen = messages.value.length
    const lastId = messages.value.filter((m) => !m.send_status).at(-1)?.id
    const server = await listWhatsappMessages({
      lead_id: props.leadId || undefined,
      deal_id: props.dealId || undefined,
      jid: props.jid,
    })
    messages.value = mergeWithLocals(server)
    const nextLast = messages.value.filter((m) => !m.send_status).at(-1)?.id
    if (!silent || messages.value.length !== prevLen || nextLast !== lastId) {
      await scrollToBottom()
    }
  } catch (e) {
    if (!silent) {
      const locals = messages.value.filter(
        (m) => m.send_status === 'pending' || m.send_status === 'failed',
      )
      messages.value = locals
      emit('error', e instanceof ApiError ? e.message : 'Não foi possível carregar as mensagens.')
    }
  } finally {
    loading.value = false
  }
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function startPoll() {
  stopPoll()
  const ms = props.pollMs ?? 3000
  if (ms <= 0) return
  pollTimer = setInterval(() => {
    void load(true)
  }, ms)
}

function onSelectEmoji(emoji: { native?: string }) {
  if (emoji.native) {
    text.value += emoji.native
  }
  showEmoji.value = false
}

function onDocPointerDown(event: PointerEvent) {
  if (!showEmoji.value || !composerRef.value) return
  const target = event.target as Node | null
  if (target && !composerRef.value.contains(target)) {
    showEmoji.value = false
  }
}

function requestSend() {
  if (!props.jid || !text.value.trim() || assumeBusy.value) return
  const body = text.value.trim()
  if (needsAssumeConfirm.value) {
    pendingBody.value = body
    assumeOpen.value = true
    return
  }
  text.value = ''
  showEmoji.value = false
  void deliverMessage(body)
}

async function onAssumeConfirm() {
  if (!props.leadId || !auth.user?.id || assumeBusy.value) return
  const body = pendingBody.value
  if (!body) {
    assumeOpen.value = false
    return
  }
  assumeBusy.value = true
  try {
    await updateLead(props.leadId, { owner_id: auth.user.id })
    emit('assumed', auth.user.id)
    assumeOpen.value = false
    pendingBody.value = ''
    text.value = ''
    showEmoji.value = false
    await deliverMessage(body)
  } catch (e) {
    emit('error', e instanceof ApiError ? e.message : 'Não foi possível assumir o cliente.')
  } finally {
    assumeBusy.value = false
  }
}

function onAssumeCancel() {
  if (assumeBusy.value) return
  const body = pendingBody.value
  assumeOpen.value = false
  pendingBody.value = ''
  if (!body) return
  text.value = ''
  showEmoji.value = false
  void deliverMessage(body)
}

async function deliverMessage(body: string) {
  if (!props.jid || !body.trim()) return

  const outboundBody = formatOutboundBody(body)
  const clientId = `local-${Date.now()}-${++localSeq}`
  const now = new Date().toISOString()
  const optimistic: ChatBubble = {
    id: -localSeq,
    client_id: clientId,
    send_status: 'pending',
    direction: 'outbound',
    body: outboundBody,
    whatsapp_jid: props.jid,
    contact_name: props.contactName,
    wa_timestamp: now,
    created_at: now,
  }
  messages.value = [...messages.value, optimistic]
  await scrollToBottom()

  try {
    const message = await sendWhatsappMessage({
      to: props.jid,
      message: body,
      contact_name: props.contactName || undefined,
    })
    const idx = messages.value.findIndex((m) => m.client_id === clientId)
    if (idx >= 0) {
      const next = [...messages.value]
      next[idx] = message
      messages.value = next
    } else {
      messages.value = [...messages.value, message]
    }
    emit('sent', message)
  } catch (e) {
    const idx = messages.value.findIndex((m) => m.client_id === clientId)
    if (idx >= 0) {
      const next = [...messages.value]
      next[idx] = { ...next[idx]!, send_status: 'failed' }
      messages.value = next
    }
    emit('error', e instanceof ApiError ? e.message : 'Não foi possível enviar a mensagem.')
  }
}

const empty = computed(() => !loading.value && messages.value.length === 0)

watch(
  () => [props.jid, props.leadId, props.dealId] as const,
  () => {
    showEmoji.value = false
    assumeOpen.value = false
    pendingBody.value = ''
    void load().then(startPoll)
  },
  { immediate: true },
)

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
})

onUnmounted(() => {
  stopPoll()
  document.removeEventListener('pointerdown', onDocPointerDown)
})

defineExpose({ reload: () => load(true) })
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <div
      ref="scroller"
      class="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl bg-[#f4f6f8] p-3"
    >
      <div v-if="loading" class="space-y-2 py-1" role="status" aria-busy="true">
        <span class="sr-only">Carregando mensagens…</span>
        <Skeleton class="h-10 w-[70%] rounded-2xl" />
        <Skeleton class="ml-auto h-10 w-[55%] rounded-2xl" />
        <Skeleton class="h-10 w-[60%] rounded-2xl" />
      </div>
      <p v-else-if="empty" class="text-center text-sm text-brand-ink/45">Nenhuma mensagem.</p>
      <div
        v-for="m in messages"
        :key="bubbleKey(m)"
        class="flex"
        :class="isOutbound(m.direction) ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[80%] rounded-2xl px-3 py-2 text-sm transition-opacity"
          :class="[
            m.send_status === 'failed'
              ? 'border border-red-300 bg-red-50 text-red-800'
              : isOutbound(m.direction)
                ? 'bg-brand-cyan text-brand-ink'
                : 'bg-white text-brand-ink shadow-sm',
            m.send_status === 'pending' ? 'opacity-45' : 'opacity-100',
          ]"
        >
          <p
            class="whitespace-pre-wrap break-words [&_em]:italic [&_strong]:font-semibold"
            v-html="bubbleHtml(m.body, m.has_media)"
          />
          <p
            class="mt-1 text-[10px]"
            :class="m.send_status === 'failed' ? 'text-red-700/80' : 'opacity-60'"
          >
            <template v-if="m.send_status === 'pending'">Enviando…</template>
            <template v-else-if="m.send_status === 'failed'">Não enviada</template>
            <template v-else>{{ formatDateTime(m.wa_timestamp || m.created_at) }}</template>
          </p>
        </div>
      </div>
    </div>

    <div ref="composerRef" class="relative">
      <div
        v-if="showEmoji"
        class="absolute bottom-full left-0 z-30 mb-2 overflow-hidden rounded-xl border border-brand-ink/10 bg-white shadow-lg"
      >
        <Picker
          :data="emojiIndex"
          :i18n="emojiI18n"
          set="twitter"
          :native="true"
          :show-preview="false"
          :emoji-size="20"
          :per-line="8"
          @select="onSelectEmoji"
        />
      </div>

      <form class="flex items-end gap-2" @submit.prevent="requestSend">
        <button
          type="button"
          class="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-brand-ink/10 bg-white text-brand-ink/55 transition hover:bg-[#f4f6f8] hover:text-brand-ink"
          :class="showEmoji ? 'border-brand-cyan/40 bg-brand-cyan/10 text-brand-ink' : ''"
          aria-label="Emojis"
          @click="showEmoji = !showEmoji"
        >
          <Icon icon="lucide:smile" class="size-5" aria-hidden="true" />
        </button>
        <textarea
          v-model="text"
          rows="1"
          placeholder="Mensagem…"
          :class="inputClass"
          class="max-h-36 min-h-11 flex-1 resize-y py-2.5"
          @focus="showEmoji = false"
          @keydown="onComposerKeydown"
        />
        <Button type="submit" icon="lucide:send">Enviar</Button>
      </form>
    </div>

    <ConfirmModal
      v-model:open="assumeOpen"
      title="Assumir cliente?"
      :message="assumeMessage"
      confirm-label="Assumir e enviar"
      cancel-label="Só enviar"
      :busy="assumeBusy"
      @confirm="onAssumeConfirm"
      @cancel="onAssumeCancel"
    />
  </div>
</template>
