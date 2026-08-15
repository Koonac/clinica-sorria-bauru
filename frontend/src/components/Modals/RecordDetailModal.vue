<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import { createActivity } from '@/api/crm/activities'
import { convertLead, deleteLead, getLead, updateLead } from '@/api/crm/leads'
import { deleteDeal, getDeal, updateDeal } from '@/api/crm/deals'
import { createTask, deleteTask, updateTask } from '@/api/crm/tasks'
import { listWhatsappMessages, sendWhatsappMessage } from '@/api/crm/whatsapp'
import type {
  Activity,
  CrmTask,
  Deal,
  Lead,
  PipelineStage,
  Source,
  WhatsappMessage,
} from '@/api/crm/types'
import Button from '@/components/Buttons/Button.vue'
import Select from '@/components/Forms/Select.vue'
import {
  formatDateTime,
  fromLocalInputValue,
  inputClass,
  labelClass,
} from '@/utils/crmFormat'

type Tab = 'dados' | 'historico' | 'notas' | 'tarefas' | 'chat' | 'perda'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  kind: 'lead' | 'deal'
  recordId: number | null
  sources: Source[]
  dealStages: PipelineStage[]
}>()

const emit = defineEmits<{
  saved: []
  deleted: []
  converted: []
}>()

const sourceOptions = computed(() => [
  { value: '', label: '—' },
  ...props.sources.map((s) => ({ value: s.id, label: s.name })),
])

const dealStageOptions = computed(() =>
  props.dealStages.map((s) => ({ value: s.id, label: s.name })),
)

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const tab = ref<Tab>('dados')
const lead = ref<Lead | null>(null)
const deal = ref<Deal | null>(null)
const chatMessages = ref<WhatsappMessage[]>([])
const chatText = ref('')
const chatLoading = ref(false)
const chatSending = ref(false)
const noteBody = ref('')
const taskForm = reactive({ title: '', due_at: '', description: '' })

const leadForm = reactive({
  name: '',
  title: '',
  email: '',
  mobile: '',
  instagram: '',
  organization_name: '',
  source_id: '' as string | number,
  value: '',
  lost_reason: '',
})

const dealForm = reactive({
  title: '',
  value: '',
  stage_id: '' as string | number,
  expected_close_on: '',
  lost_reason: '',
  lost_notes: '',
})

const record = computed(() => (props.kind === 'lead' ? lead.value : deal.value))
const activities = computed(() => record.value?.activities || [])
const notes = computed(() => activities.value.filter((a) => a.type === 'note'))
const history = computed(() => activities.value.filter((a) => a.type !== 'note'))
const tasks = computed(() => record.value?.tasks || [])
const jid = computed(() => {
  if (props.kind === 'lead') return lead.value?.whatsapp_jid || ''
  return deal.value?.whatsapp_jid || deal.value?.contact?.whatsapp_jid || ''
})
const showChat = computed(() => Boolean(jid.value))
const showPerda = computed(() => {
  const stage = record.value?.stage
  return Boolean(stage?.is_lost || (props.kind === 'lead' && lead.value?.lost_reason))
})

const tabs = computed(() => {
  const base: { id: Tab; label: string }[] = [
    { id: 'dados', label: 'Dados' },
    { id: 'historico', label: 'Histórico' },
    { id: 'notas', label: 'Notas' },
    { id: 'tarefas', label: 'Tarefas' },
  ]
  if (showChat.value) base.push({ id: 'chat', label: 'Chat' })
  if (showPerda.value || props.kind === 'deal') base.push({ id: 'perda', label: 'Perda' })
  return base
})

function close() {
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    close()
  }
}

async function load() {
  if (!props.recordId) return
  loading.value = true
  error.value = ''
  try {
    if (props.kind === 'lead') {
      lead.value = await getLead(props.recordId)
      deal.value = null
      leadForm.name = lead.value.name || ''
      leadForm.title = lead.value.title || ''
      leadForm.email = lead.value.email || ''
      leadForm.mobile = lead.value.mobile || ''
      leadForm.instagram = lead.value.instagram || ''
      leadForm.organization_name = lead.value.organization_name || ''
      leadForm.source_id = lead.value.source_id ?? ''
      leadForm.value = lead.value.value != null ? String(lead.value.value) : ''
      leadForm.lost_reason = lead.value.lost_reason || ''
    } else {
      deal.value = await getDeal(props.recordId)
      lead.value = null
      dealForm.title = deal.value.title || ''
      dealForm.value = deal.value.value != null ? String(deal.value.value) : ''
      dealForm.stage_id = deal.value.stage_id
      dealForm.expected_close_on = deal.value.expected_close_on
        ? String(deal.value.expected_close_on).slice(0, 10)
        : ''
      dealForm.lost_reason = deal.value.lost_reason || ''
      dealForm.lost_notes = deal.value.lost_notes || ''
    }
    tab.value = 'dados'
    if (showChat.value) await loadChat()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Não foi possível carregar o registro.'
  } finally {
    loading.value = false
  }
}

async function loadChat() {
  if (!props.recordId || !jid.value) return
  chatLoading.value = true
  try {
    chatMessages.value = await listWhatsappMessages({
      lead_id: props.kind === 'lead' ? props.recordId : undefined,
      deal_id: props.kind === 'deal' ? props.recordId : undefined,
      jid: jid.value,
    })
    await nextTick()
  } catch {
    chatMessages.value = []
  } finally {
    chatLoading.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onKeydown)
    void load()
  } else {
    document.removeEventListener('keydown', onKeydown)
    lead.value = null
    deal.value = null
  }
})

watch(
  () => [props.kind, props.recordId] as const,
  () => {
    if (open.value) void load()
  },
)

onUnmounted(() => document.removeEventListener('keydown', onKeydown))

async function saveDados() {
  if (!props.recordId || saving.value) return
  saving.value = true
  error.value = ''
  try {
    if (props.kind === 'lead') {
      lead.value = await updateLead(props.recordId, {
        name: leadForm.name.trim(),
        title: leadForm.title.trim() || undefined,
        email: leadForm.email.trim() || null,
        mobile: leadForm.mobile.trim() || null,
        instagram: leadForm.instagram.trim() || null,
        organization_name: leadForm.organization_name.trim() || null,
        source_id: leadForm.source_id === '' ? null : Number(leadForm.source_id),
        value: leadForm.value === '' ? null : Number(leadForm.value),
        lost_reason: leadForm.lost_reason.trim() || null,
      })
    } else {
      deal.value = await updateDeal(props.recordId, {
        title: dealForm.title.trim(),
        value: dealForm.value === '' ? null : Number(dealForm.value),
        stage_id: Number(dealForm.stage_id),
        expected_close_on: dealForm.expected_close_on || null,
        lost_reason: dealForm.lost_reason.trim() || null,
        lost_notes: dealForm.lost_notes.trim() || null,
      })
    }
    emit('saved')
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Não foi possível salvar.'
  } finally {
    saving.value = false
  }
}

async function removeRecord() {
  if (!props.recordId || !confirm('Excluir este registro?')) return
  saving.value = true
  try {
    if (props.kind === 'lead') await deleteLead(props.recordId)
    else await deleteDeal(props.recordId)
    emit('deleted')
    close()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Não foi possível excluir.'
  } finally {
    saving.value = false
  }
}

async function doConvert() {
  if (!props.recordId || props.kind !== 'lead') return
  saving.value = true
  error.value = ''
  try {
    await convertLead(props.recordId, {
      title: leadForm.title.trim() || leadForm.name.trim(),
      value: leadForm.value === '' ? undefined : Number(leadForm.value),
    })
    emit('converted')
    close()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Não foi possível converter.'
  } finally {
    saving.value = false
  }
}

async function addNote() {
  if (!props.recordId || !noteBody.value.trim()) return
  saving.value = true
  try {
    await createActivity({
      type: 'note',
      body: noteBody.value.trim(),
      lead_id: props.kind === 'lead' ? props.recordId : null,
      deal_id: props.kind === 'deal' ? props.recordId : null,
    })
    noteBody.value = ''
    await load()
    tab.value = 'notas'
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Não foi possível criar a nota.'
  } finally {
    saving.value = false
  }
}

async function addTask() {
  if (!props.recordId || !taskForm.title.trim() || !taskForm.due_at) return
  saving.value = true
  try {
    await createTask({
      title: taskForm.title.trim(),
      description: taskForm.description.trim() || null,
      due_at: fromLocalInputValue(taskForm.due_at),
      lead_id: props.kind === 'lead' ? props.recordId : null,
      deal_id: props.kind === 'deal' ? props.recordId : null,
    })
    taskForm.title = ''
    taskForm.description = ''
    taskForm.due_at = ''
    await load()
    tab.value = 'tarefas'
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Não foi possível criar a tarefa.'
  } finally {
    saving.value = false
  }
}

async function toggleTask(task: CrmTask) {
  try {
    await updateTask(task.id, { done: !task.done_at })
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Não foi possível atualizar a tarefa.'
  }
}

async function removeTask(task: CrmTask) {
  try {
    await deleteTask(task.id)
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Não foi possível excluir a tarefa.'
  }
}

async function sendChat() {
  if (!jid.value || !chatText.value.trim() || chatSending.value) return
  chatSending.value = true
  try {
    await sendWhatsappMessage({
      to: jid.value,
      message: chatText.value.trim(),
      contact_name: props.kind === 'lead' ? lead.value?.name : deal.value?.contact?.name,
    })
    chatText.value = ''
    await loadChat()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Não foi possível enviar a mensagem.'
  } finally {
    chatSending.value = false
  }
}

function activityLabel(a: Activity): string {
  return a.subject || a.body || a.type
}

function isOutbound(direction: string): boolean {
  return direction === 'out' || direction === 'outbound'
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-6"
      @click.self="close"
    >
      <div
        role="dialog"
        aria-modal="true"
        class="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <header class="flex items-start justify-between gap-3 border-b border-brand-ink/10 px-5 py-4">
          <div class="min-w-0">
            <p class="text-[0.7rem] font-medium tracking-[0.2em] text-brand-cyan-ink uppercase">
              {{ kind === 'lead' ? 'Lead' : 'Negócio' }}
            </p>
            <h2 class="mt-1 truncate text-xl font-semibold text-brand-ink">
              {{ kind === 'lead' ? lead?.name || '…' : deal?.title || '…' }}
            </h2>
          </div>
          <button
            type="button"
            class="rounded-full p-2 text-brand-ink/45 hover:bg-[#f4f6f8]"
            aria-label="Fechar"
            @click="close"
          >
            <Icon icon="lucide:x" class="size-5" />
          </button>
        </header>

        <nav class="flex gap-1 overflow-x-auto border-b border-brand-ink/10 px-3 pt-2">
          <button
            v-for="t in tabs"
            :key="t.id"
            type="button"
            class="rounded-t-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition"
            :class="
              tab === t.id
                ? 'bg-[#f4f6f8] text-brand-ink'
                : 'text-brand-ink/50 hover:text-brand-ink'
            "
            @click="tab = t.id"
          >
            {{ t.label }}
          </button>
        </nav>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p v-if="loading" class="py-8 text-center text-sm text-brand-ink/50">Carregando…</p>
          <p v-else-if="error" class="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {{ error }}
          </p>

          <template v-if="!loading && record">
            <div v-show="tab === 'dados'" class="space-y-3">
              <template v-if="kind === 'lead'">
                <div class="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label :class="labelClass">Nome</label>
                    <input v-model="leadForm.name" :class="inputClass" />
                  </div>
                  <div>
                    <label :class="labelClass">Título</label>
                    <input v-model="leadForm.title" :class="inputClass" />
                  </div>
                  <div>
                    <label :class="labelClass">E-mail</label>
                    <input v-model="leadForm.email" type="email" :class="inputClass" />
                  </div>
                  <div>
                    <label :class="labelClass">Celular</label>
                    <input v-model="leadForm.mobile" :class="inputClass" />
                  </div>
                  <div>
                    <label :class="labelClass">Instagram</label>
                    <input v-model="leadForm.instagram" :class="inputClass" />
                  </div>
                  <div>
                    <label :class="labelClass">Empresa</label>
                    <input v-model="leadForm.organization_name" :class="inputClass" />
                  </div>
                  <div>
                    <label :class="labelClass">Origem</label>
                    <Select
                      v-model="leadForm.source_id"
                      placeholder="—"
                      :options="sourceOptions"
                    />
                  </div>
                  <div>
                    <label :class="labelClass">Valor</label>
                    <input v-model="leadForm.value" type="number" min="0" step="0.01" :class="inputClass" />
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="grid gap-3 sm:grid-cols-2">
                  <div class="sm:col-span-2">
                    <label :class="labelClass">Título</label>
                    <input v-model="dealForm.title" :class="inputClass" />
                  </div>
                  <div>
                    <label :class="labelClass">Valor</label>
                    <input v-model="dealForm.value" type="number" min="0" step="0.01" :class="inputClass" />
                  </div>
                  <div>
                    <label :class="labelClass">Estágio</label>
                    <Select v-model="dealForm.stage_id" :options="dealStageOptions" />
                  </div>
                  <div>
                    <label :class="labelClass">Previsão de fechamento</label>
                    <input v-model="dealForm.expected_close_on" type="date" :class="inputClass" />
                  </div>
                </div>
              </template>
            </div>

            <div v-show="tab === 'historico'" class="space-y-2">
              <p v-if="!history.length" class="text-sm text-brand-ink/45">Sem histórico.</p>
              <article
                v-for="a in history"
                :key="a.id"
                class="rounded-xl border border-brand-ink/10 bg-[#f8fafb] px-3 py-2.5"
              >
                <div class="flex items-center justify-between gap-2 text-xs text-brand-ink/45">
                  <span class="font-medium uppercase">{{ a.type }}</span>
                  <span>{{ formatDateTime(a.created_at) }}</span>
                </div>
                <p class="mt-1 text-sm text-brand-ink">{{ activityLabel(a) }}</p>
              </article>
            </div>

            <div v-show="tab === 'notas'" class="space-y-3">
              <div class="flex gap-2">
                <textarea
                  v-model="noteBody"
                  rows="2"
                  placeholder="Nova nota…"
                  :class="inputClass"
                  class="flex-1"
                />
                <Button :loading="saving" @click="addNote">Adicionar</Button>
              </div>
              <p v-if="!notes.length" class="text-sm text-brand-ink/45">Nenhuma nota.</p>
              <article
                v-for="a in notes"
                :key="a.id"
                class="rounded-xl border border-brand-ink/10 px-3 py-2.5"
              >
                <p class="text-xs text-brand-ink/45">{{ formatDateTime(a.created_at) }}</p>
                <p class="mt-1 text-sm text-brand-ink">{{ a.body || a.subject }}</p>
              </article>
            </div>

            <div v-show="tab === 'tarefas'" class="space-y-3">
              <div class="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <input v-model="taskForm.title" placeholder="Título" :class="inputClass" />
                <input v-model="taskForm.due_at" type="datetime-local" :class="inputClass" />
                <Button :loading="saving" @click="addTask">Criar</Button>
              </div>
              <p v-if="!tasks.length" class="text-sm text-brand-ink/45">Nenhuma tarefa.</p>
              <article
                v-for="t in tasks"
                :key="t.id"
                class="flex items-start gap-3 rounded-xl border border-brand-ink/10 px-3 py-2.5"
              >
                <button
                  type="button"
                  class="mt-0.5 text-brand-ink/40 hover:text-brand-cyan-ink"
                  @click="toggleTask(t)"
                >
                  <Icon :icon="t.done_at ? 'lucide:check-circle-2' : 'lucide:circle'" class="size-5" />
                </button>
                <div class="min-w-0 flex-1">
                  <p
                    class="text-sm font-medium text-brand-ink"
                    :class="t.done_at ? 'line-through opacity-55' : ''"
                  >
                    {{ t.title }}
                  </p>
                  <p class="text-xs text-brand-ink/45">{{ formatDateTime(t.due_at) }}</p>
                </div>
                <button
                  type="button"
                  class="text-brand-ink/30 hover:text-red-600"
                  @click="removeTask(t)"
                >
                  <Icon icon="lucide:trash-2" class="size-4" />
                </button>
              </article>
            </div>

            <div v-show="tab === 'chat'" class="flex h-[22rem] flex-col gap-3">
              <div class="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl bg-[#f4f6f8] p-3">
                <p v-if="chatLoading" class="text-center text-sm text-brand-ink/45">Carregando…</p>
                <p
                  v-else-if="!chatMessages.length"
                  class="text-center text-sm text-brand-ink/45"
                >
                  Nenhuma mensagem.
                </p>
                <div
                  v-for="m in chatMessages"
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
              <form class="flex gap-2" @submit.prevent="sendChat">
                <input
                  v-model="chatText"
                  placeholder="Mensagem…"
                  :class="inputClass"
                  class="flex-1"
                />
                <Button type="submit" :loading="chatSending" icon="lucide:send">Enviar</Button>
              </form>
            </div>

            <div v-show="tab === 'perda'" class="space-y-3">
              <div v-if="kind === 'lead'">
                <label :class="labelClass">Motivo da perda</label>
                <textarea v-model="leadForm.lost_reason" rows="3" :class="inputClass" />
              </div>
              <template v-else>
                <div>
                  <label :class="labelClass">Motivo</label>
                  <input v-model="dealForm.lost_reason" :class="inputClass" />
                </div>
                <div>
                  <label :class="labelClass">Notas</label>
                  <textarea v-model="dealForm.lost_notes" rows="3" :class="inputClass" />
                </div>
              </template>
            </div>
          </template>
        </div>

        <footer
          class="flex flex-wrap items-center justify-between gap-2 border-t border-brand-ink/10 px-5 py-4"
        >
          <Button variant="danger" size="sm" :loading="saving" @click="removeRecord">
            Excluir
          </Button>
          <div class="flex flex-wrap gap-2">
            <Button
              v-if="kind === 'lead' && lead?.status !== 'converted'"
              variant="secondary"
              size="sm"
              :loading="saving"
              @click="doConvert"
            >
              Converter em negócio
            </Button>
            <Button variant="secondary" size="sm" @click="close">Fechar</Button>
            <Button size="sm" :loading="saving" @click="saveDados">Salvar</Button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
