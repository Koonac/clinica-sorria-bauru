<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { ApiError } from '@/api/client'
import { listWhatsappMessages, sendWhatsappMessage } from '@/api/crm/whatsapp'
import type { WhatsappMessage } from '@/api/crm/types'
import Button from '@/components/Buttons/Button.vue'
import Skeleton from '@/components/Feedback/Skeleton.vue'
import { formatDateTime, inputClass } from '@/utils/crmFormat'

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

const messages = ref<WhatsappMessage[]>([])
const text = ref('')
const loading = ref(true)
const sending = ref(false)
const scroller = ref<HTMLElement | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

function isOutbound(direction: string): boolean {
  return direction === 'out' || direction === 'outbound'
}

async function scrollToBottom() {
  await nextTick()
  if (scroller.value) {
    scroller.value.scrollTop = scroller.value.scrollHeight
  }
}

async function load(silent = false) {
  if (!props.jid) return
  if (!silent) loading.value = true
  try {
    const prevLen = messages.value.length
    const lastId = messages.value[messages.value.length - 1]?.id
    messages.value = await listWhatsappMessages({
      lead_id: props.leadId || undefined,
      deal_id: props.dealId || undefined,
      jid: props.jid,
    })
    const nextLast = messages.value[messages.value.length - 1]?.id
    if (!silent || messages.value.length !== prevLen || nextLast !== lastId) {
      await scrollToBottom()
    }
  } catch (e) {
    if (!silent) {
      messages.value = []
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

async function send() {
  if (!props.jid || !text.value.trim() || sending.value) return
  sending.value = true
  try {
    const message = await sendWhatsappMessage({
      to: props.jid,
      message: text.value.trim(),
      contact_name: props.contactName || undefined,
    })
    text.value = ''
    emit('sent', message)
    await load(true)
  } catch (e) {
    emit('error', e instanceof ApiError ? e.message : 'Não foi possível enviar a mensagem.')
  } finally {
    sending.value = false
  }
}

watch(
  () => [props.jid, props.leadId, props.dealId] as const,
  () => {
    void load().then(startPoll)
  },
  { immediate: true },
)

onUnmounted(stopPoll)

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
      <p v-else-if="!messages.length" class="text-center text-sm text-brand-ink/45">
        Nenhuma mensagem.
      </p>
      <div
        v-for="m in messages"
        :key="m.id"
        class="flex"
        :class="isOutbound(m.direction) ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[80%] rounded-2xl px-3 py-2 text-sm"
          :class="
            isOutbound(m.direction)
              ? 'bg-brand-cyan text-brand-ink'
              : 'bg-white text-brand-ink shadow-sm'
          "
        >
          <p class="whitespace-pre-wrap">{{ m.body || (m.has_media ? '[mídia]' : '') }}</p>
          <p class="mt-1 text-[10px] opacity-60">
            {{ formatDateTime(m.wa_timestamp || m.created_at) }}
          </p>
        </div>
      </div>
    </div>
    <form class="flex gap-2" @submit.prevent="send">
      <input v-model="text" placeholder="Mensagem…" :class="inputClass" class="flex-1" />
      <Button type="submit" :loading="sending" icon="lucide:send">Enviar</Button>
    </form>
  </div>
</template>
