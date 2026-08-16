<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { Picker, EmojiIndex } from 'emoji-mart-vue-fast/src'
import data from 'emoji-mart-vue-fast/data/all.json'
import 'emoji-mart-vue-fast/css/emoji-mart.css'
import { ApiError } from '@/api/client'
import { updateLead } from '@/api/crm/leads'
import { listWhatsappMessages, sendWhatsappMessage } from '@/api/crm/whatsapp'
import type { SendWhatsappMedia } from '@/api/crm/whatsapp'
import type { WhatsappMessage } from '@/api/crm/types'
import Skeleton from '@/components/Feedback/Skeleton.vue'
import ConfirmModal from '@/components/Modals/ConfirmModal.vue'
import WhatsappMediaAttachment from '@/components/whatsapp/WhatsappMediaAttachment.vue'
import WhatsappImagePreview from '@/components/whatsapp/WhatsappImagePreview.vue'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime, inputClass } from '@/utils/crmFormat'
import { formatWhatsappText, whatsappSenderPrefix } from '@/utils/whatsappFormat'

type SendStatus = 'pending' | 'failed'

type AttachmentKind = 'image' | 'document'

type Attachment = {
  kind: AttachmentKind
  mimetype: string
  filename: string
  /** base64 puro, sem data URI */
  data: string
  previewUrl: string
  size: number
}

type ChatBubble = WhatsappMessage & {
  client_id?: string
  client_seq?: number
  /** Momento em que o usuário disparou o envio — estabiliza a ordem na UI */
  sort_at?: string
  send_status?: SendStatus
  /** Preview local enquanto o envio da mídia não confirma */
  local_media_url?: string
  local_media_kind?: AttachmentKind
}

const MAX_MEDIA_BYTES = 8 * 1024 * 1024

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
const showAttach = ref(false)
const scroller = ref<HTMLElement | null>(null)
const composerRef = ref<HTMLElement | null>(null)
const assumeOpen = ref(false)
const assumeBusy = ref(false)
const pendingBody = ref('')
const attachment = ref<Attachment | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const documentInput = ref<HTMLInputElement | null>(null)

const DOCUMENT_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.zip'

const DOCUMENT_MIME_PREFIXES = ['application/', 'text/']
let pollTimer: ReturnType<typeof setInterval> | null = null
let localSeq = 0
const previewUrls = new Set<string>()

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

function mediaPlaceholder(m: ChatBubble): string {
  const mime = (m.media?.mimetype || '').toLowerCase()
  if (mime.startsWith('image/') || m.type === 'image' || m.type === 'sticker') return '[imagem]'
  if (mime.startsWith('audio/') || m.type === 'audio' || m.type === 'ptt') return '[áudio]'
  if (m.type === 'document' || mime.startsWith('application/') || mime.startsWith('text/')) {
    return '[documento]'
  }
  return '[mídia]'
}

function bubbleHtml(m: ChatBubble): string {
  const text = m.body || (m.has_media && !m.media_url ? mediaPlaceholder(m) : '')
  return formatWhatsappText(text)
}

function hasBubbleText(m: ChatBubble): boolean {
  return !!m.body || (!!m.has_media && !m.media_url && !m.local_media_url)
}

function attachmentLabel(file: Attachment): string {
  const kb = file.size / 1024
  const size = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`
  return `${file.filename} · ${size}`
}

function releasePreview(url: string) {
  if (previewUrls.delete(url)) {
    URL.revokeObjectURL(url)
  }
}

function clearAttachment() {
  const current = attachment.value
  attachment.value = null
  if (current && !messages.value.some((m) => m.local_media_url === current.previewUrl)) {
    releasePreview(current.previewUrl)
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const [, data] = String(reader.result).split(',')
      data ? resolve(data) : reject(new Error('Não foi possível ler o arquivo.'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}

async function onPickFile(event: Event, kind: AttachmentKind) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const mimetype = inferMimetype(file, kind)
  if (kind === 'image' && !mimetype.startsWith('image/')) {
    emit('error', 'Selecione um arquivo de imagem.')
    return
  }
  if (kind === 'document' && !isDocumentMime(mimetype)) {
    emit('error', 'Selecione um documento (PDF, Word, Excel, etc.).')
    return
  }
  if (file.size > MAX_MEDIA_BYTES) {
    emit('error', 'Arquivo muito grande (máx. 8 MB).')
    return
  }

  try {
    const data = await fileToBase64(file)
    clearAttachment()
    const previewUrl = URL.createObjectURL(file)
    previewUrls.add(previewUrl)
    attachment.value = {
      kind,
      mimetype,
      filename: file.name || (kind === 'image' ? 'imagem.jpg' : 'documento.pdf'),
      data,
      previewUrl,
      size: file.size,
    }
    showEmoji.value = false
  } catch {
    emit('error', 'Não foi possível ler o arquivo selecionado.')
  }
}

function aiTextLabel(m: ChatBubble): string | null {
  if (m.media?.transcript) return 'Transcrição por IA'
  if (m.media?.description) return 'Descrição por IA'
  return null
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

function matchesOutgoing(local: ChatBubble, server: WhatsappMessage, serverBody: string): boolean {
  const localBody = (local.body || '').trim()
  if (Boolean(local.has_media) !== Boolean(server.has_media)) return false
  if (local.has_media) {
    return (local.type || '') === (server.type || '') && localBody === serverBody
  }
  return serverBody !== '' && localBody === serverBody
}

const canSend = computed(() => Boolean(text.value.trim() || attachment.value))

function toggleAttach() {
  showAttach.value = !showAttach.value
  if (showAttach.value) showEmoji.value = false
}

function inferMimetype(file: File, kind: AttachmentKind): string {
  const fromBrowser = (file.type || '').toLowerCase()
  if (fromBrowser) return fromBrowser
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const byExt: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    csv: 'text/csv',
    rtf: 'application/rtf',
    zip: 'application/zip',
  }
  if (byExt[ext]) return byExt[ext]
  return kind === 'image' ? 'image/jpeg' : 'application/octet-stream'
}

function isDocumentMime(mimetype: string): boolean {
  return DOCUMENT_MIME_PREFIXES.some((prefix) => mimetype.startsWith(prefix))
}

function openPicker(kind: AttachmentKind) {
  showAttach.value = false
  showEmoji.value = false
  if (kind === 'image') imageInput.value?.click()
  else documentInput.value?.click()
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
    const ta = new Date(a.sort_at || a.wa_timestamp || a.created_at || 0).getTime()
    const tb = new Date(b.sort_at || b.wa_timestamp || b.created_at || 0).getTime()
    if (ta !== tb) return ta - tb

    const sa = a.client_seq
    const sb = b.client_seq
    if (sa != null && sb != null && sa !== sb) return sa - sb
    if (sa != null && sb == null) return -1
    if (sb != null && sa == null) return 1

    // Evita id negativo (otimista) “ganhar” de id positivo do servidor no mesmo segundo.
    const ia = a.id != null && a.id > 0 ? a.id : Number.MAX_SAFE_INTEGER
    const ib = b.id != null && b.id > 0 ? b.id : Number.MAX_SAFE_INTEGER
    if (ia !== ib) return ia - ib

    return 0
  })
}

function mergeWithLocals(server: WhatsappMessage[]): ChatBubble[] {
  const locals = messages.value.filter((m) => m.send_status === 'pending' || m.send_status === 'failed')
  const used = new Set<string>()

  const enriched: ChatBubble[] = server.map((s) => {
    if (!isOutbound(s.direction)) return { ...s }

    const body = (s.body || '').trim()
    const match = locals.find((local) => {
      if (!local.client_id || used.has(local.client_id)) return false
      return matchesOutgoing(local, s, body)
    })

    if (!match?.client_id) return { ...s }

    used.add(match.client_id)
    return {
      ...s,
      client_id: match.client_id,
      client_seq: match.client_seq,
      sort_at: match.sort_at,
    }
  })

  // Já confirmadas nesta sessão (sem send_status) também preservam seq/sort_at.
  const confirmedLocals = messages.value.filter(
    (m) => m.client_id && m.client_seq != null && !m.send_status,
  )
  for (const local of confirmedLocals) {
    if (!local.client_id || used.has(local.client_id)) continue
    const idx = enriched.findIndex((s) => {
      if (s.client_seq != null) return false
      if (!isOutbound(s.direction)) return false
      if (local.id > 0 && s.id === local.id) return true
      return matchesOutgoing(local, s, (s.body || '').trim())
    })
    if (idx < 0) continue
    used.add(local.client_id)
    enriched[idx] = {
      ...enriched[idx]!,
      client_id: local.client_id,
      client_seq: local.client_seq,
      sort_at: local.sort_at,
    }
  }

  const kept = locals.filter((local) => !local.client_id || !used.has(local.client_id))
  return sortMessages([...enriched, ...kept])
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

function toggleEmoji() {
  showEmoji.value = !showEmoji.value
  if (showEmoji.value) showAttach.value = false
}

function onDocPointerDown(event: PointerEvent) {
  if ((!showEmoji.value && !showAttach.value) || !composerRef.value) return
  const target = event.target as Node | null
  if (target && !composerRef.value.contains(target)) {
    showEmoji.value = false
    showAttach.value = false
  }
}

function requestSend() {
  if (!props.jid || assumeBusy.value) return
  const body = text.value.trim()
  if (!body && !attachment.value) return
  showAttach.value = false
  if (needsAssumeConfirm.value) {
    pendingBody.value = body
    assumeOpen.value = true
    return
  }
  text.value = ''
  showEmoji.value = false
  void deliverPending(body)
}

async function deliverPending(body: string) {
  const file = attachment.value
  attachment.value = null

  if (!file) {
    await deliverMessage(body)
    return
  }

  await deliverMessage(body, file)
}

async function onAssumeConfirm() {
  if (!props.leadId || !auth.user?.id || assumeBusy.value) return
  const body = pendingBody.value
  if (!body && !attachment.value) {
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
    await deliverPending(body)
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
  if (!body && !attachment.value) return
  text.value = ''
  showEmoji.value = false
  void deliverPending(body)
}

async function deliverMessage(body: string, file?: Attachment) {
  if (!props.jid) return
  if (!body.trim() && !file) return

  const outboundBody = body.trim() ? formatOutboundBody(body) : null
  const clientSeq = ++localSeq
  const clientId = `local-${Date.now()}-${clientSeq}`
  const now = new Date().toISOString()
  const optimistic: ChatBubble = {
    id: -clientSeq,
    client_id: clientId,
    client_seq: clientSeq,
    sort_at: now,
    send_status: 'pending',
    direction: 'outbound',
    body: outboundBody,
    whatsapp_jid: props.jid,
    contact_name: props.contactName,
    wa_timestamp: now,
    created_at: now,
    has_media: !!file,
    type: file ? (file.kind === 'document' ? 'document' : 'image') : undefined,
    media: file ? { filename: file.filename, mimetype: file.mimetype } : undefined,
    local_media_url: file?.previewUrl,
    local_media_kind: file?.kind,
  }
  messages.value = [...messages.value, optimistic]
  await scrollToBottom()

  const media: SendWhatsappMedia | undefined = file
    ? {
        mimetype: file.mimetype,
        data: file.data,
        filename: file.filename,
      }
    : undefined

  try {
    const message = await sendWhatsappMessage({
      to: props.jid,
      message: body,
      contact_name: props.contactName || undefined,
      media,
    })
    const idx = messages.value.findIndex((m) => m.client_id === clientId)
    const confirmed: ChatBubble = {
      ...message,
      client_id: clientId,
      client_seq: clientSeq,
      sort_at: optimistic.sort_at,
    }
    if (idx >= 0) {
      const next = [...messages.value]
      next[idx] = confirmed
      messages.value = next
    } else {
      messages.value = sortMessages([...messages.value, confirmed])
    }
    if (file) releasePreview(file.previewUrl)
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

function releaseAllPreviews() {
  for (const url of [...previewUrls]) {
    releasePreview(url)
  }
}

watch(
  () => [props.jid, props.leadId, props.dealId] as const,
  () => {
    showEmoji.value = false
    showAttach.value = false
    assumeOpen.value = false
    pendingBody.value = ''
    attachment.value = null
    releaseAllPreviews()
    void load().then(startPoll)
  },
  { immediate: true },
)

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
})

onUnmounted(() => {
  stopPoll()
  releaseAllPreviews()
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
          <WhatsappMediaAttachment v-if="m.media_url" :message="m" />
          <div v-else-if="m.local_media_url" class="mb-1.5">
            <WhatsappImagePreview
              v-if="m.local_media_kind === 'image'"
              :src="m.local_media_url"
              alt="Imagem sendo enviada"
            />
            <div
              v-else
              class="flex items-center gap-2 rounded-xl bg-brand-ink/[0.06] px-3 py-2 text-xs font-medium text-brand-ink/70"
            >
              <Icon icon="lucide:file-text" class="size-4 shrink-0" aria-hidden="true" />
              <span class="truncate">{{ m.media?.filename || 'Documento' }}</span>
            </div>
          </div>
          <p v-if="aiTextLabel(m)" class="mb-0.5 flex items-center gap-1 text-[10px] opacity-60">
            <Icon icon="lucide:sparkles" class="size-3" aria-hidden="true" />
            {{ aiTextLabel(m) }}
          </p>
          <p
            v-if="hasBubbleText(m)"
            class="whitespace-pre-wrap break-words [&_em]:italic [&_strong]:font-semibold"
            v-html="bubbleHtml(m)"
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

      <div
        v-if="attachment"
        class="mb-2 flex items-center gap-3 rounded-xl border border-brand-ink/10 bg-white p-2"
      >
        <img
          v-if="attachment.kind === 'image'"
          :src="attachment.previewUrl"
          alt="Prévia da imagem"
          class="size-14 shrink-0 rounded-lg object-cover"
        />
        <div
          v-else
          class="flex size-14 shrink-0 items-center justify-center rounded-lg bg-brand-cyan/10 text-brand-cyan-ink"
        >
          <Icon icon="lucide:file-text" class="size-6" aria-hidden="true" />
        </div>

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-brand-ink">{{ attachmentLabel(attachment) }}</p>
          <p class="text-xs text-brand-ink/55">O texto digitado vai como legenda.</p>
        </div>

        <button
          type="button"
          class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-brand-ink/50 transition hover:bg-[#f4f6f8] hover:text-brand-ink"
          aria-label="Remover anexo"
          @click="clearAttachment"
        >
          <Icon icon="lucide:x" class="size-4" aria-hidden="true" />
        </button>
      </div>

      <form class="flex items-end gap-2" @submit.prevent="requestSend">
        <input
          ref="imageInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="onPickFile($event, 'image')"
        />
        <input
          ref="documentInput"
          type="file"
          :accept="DOCUMENT_ACCEPT"
          class="hidden"
          @change="onPickFile($event, 'document')"
        />
        <button
          type="button"
          class="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-brand-ink/10 bg-white text-brand-ink/55 transition hover:bg-[#f4f6f8] hover:text-brand-ink"
          :class="showEmoji ? 'border-brand-cyan/40 bg-brand-cyan/10 text-brand-ink' : ''"
          aria-label="Emojis"
          @click="toggleEmoji"
        >
          <Icon icon="lucide:smile" class="size-5" aria-hidden="true" />
        </button>
        <div class="relative">
          <button
            type="button"
            class="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-brand-ink/10 bg-white text-brand-ink/55 transition hover:bg-[#f4f6f8] hover:text-brand-ink"
            :class="showAttach || attachment ? 'border-brand-cyan/40 bg-brand-cyan/10 text-brand-ink' : ''"
            aria-label="Anexar arquivo do computador"
            title="Anexar imagem ou documento"
            @click="toggleAttach"
          >
            <Icon icon="lucide:paperclip" class="size-5" aria-hidden="true" />
          </button>
          <div
            v-if="showAttach"
            class="absolute bottom-full left-0 z-30 mb-2 w-56 overflow-hidden rounded-xl border border-brand-ink/10 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              class="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-brand-ink transition hover:bg-[#f4f6f8]"
              @click="openPicker('image')"
            >
              <Icon icon="lucide:image" class="size-4 text-brand-ink/55" aria-hidden="true" />
              Imagem
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-brand-ink transition hover:bg-[#f4f6f8]"
              @click="openPicker('document')"
            >
              <Icon icon="lucide:file-text" class="size-4 text-brand-ink/55" aria-hidden="true" />
              Documento
            </button>
          </div>
        </div>
        <textarea
          v-model="text"
          rows="1"
          placeholder="Mensagem…"
          :class="inputClass"
          class="max-h-36 min-h-11 flex-1 resize-y py-2.5"
          @focus="showEmoji = false; showAttach = false"
          @keydown="onComposerKeydown"
        />
        <button
          type="submit"
          class="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-cyan text-brand-ink transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55"
          :disabled="!canSend"
          aria-label="Enviar"
        >
          <Icon icon="lucide:send" class="size-5" aria-hidden="true" />
        </button>
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
