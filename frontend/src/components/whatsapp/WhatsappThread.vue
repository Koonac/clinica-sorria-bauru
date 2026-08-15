<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { Picker, EmojiIndex } from 'emoji-mart-vue-fast/src'
import data from 'emoji-mart-vue-fast/data/all.json'
import 'emoji-mart-vue-fast/css/emoji-mart.css'
import { ApiError } from '@/api/client'
import { listWhatsappMessages, sendWhatsappMessage } from '@/api/crm/whatsapp'
import type { WhatsappMessage } from '@/api/crm/types'
import Button from '@/components/Buttons/Button.vue'
import Skeleton from '@/components/Feedback/Skeleton.vue'
import { formatDateTime, inputClass } from '@/utils/crmFormat'

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
  pollMs?: number
}>()

const emit = defineEmits<{
  sent: [message: WhatsappMessage]
  error: [message: string]
}>()

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
let pollTimer: ReturnType<typeof setInterval> | null = null
let localSeq = 0

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

async function send() {
  if (!props.jid || !text.value.trim()) return
  const body = text.value.trim()
  text.value = ''
  showEmoji.value = false

  const clientId = `local-${Date.now()}-${++localSeq}`
  const now = new Date().toISOString()
  const optimistic: ChatBubble = {
    id: -localSeq,
    client_id: clientId,
    send_status: 'pending',
    direction: 'outbound',
    body,
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
          <p class="whitespace-pre-wrap">{{ m.body || (m.has_media ? '[mídia]' : '') }}</p>
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

      <form class="flex gap-2" @submit.prevent="send">
        <button
          type="button"
          class="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-brand-ink/10 bg-white text-brand-ink/55 transition hover:bg-[#f4f6f8] hover:text-brand-ink"
          :class="showEmoji ? 'border-brand-cyan/40 bg-brand-cyan/10 text-brand-ink' : ''"
          aria-label="Emojis"
          @click="showEmoji = !showEmoji"
        >
          <Icon icon="lucide:smile" class="size-5" aria-hidden="true" />
        </button>
        <input
          v-model="text"
          placeholder="Mensagem…"
          :class="inputClass"
          class="flex-1"
          @focus="showEmoji = false"
        />
        <Button type="submit" icon="lucide:send">Enviar</Button>
      </form>
    </div>
  </div>
</template>
