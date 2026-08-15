<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import type { CrmAttendant, WhatsappChat } from '@/api/crm/types'
import Button from '@/components/Buttons/Button.vue'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime } from '@/utils/crmFormat'

const props = defineProps<{
  chat: WhatsappChat
  attendants: CrmAttendant[]
  busy?: boolean
  leadSidebarOpen?: boolean
}>()

const emit = defineEmits<{
  assume: []
  transfer: [ownerId: number]
  pauseAgent: []
  resumeAgent: []
  finalize: []
  toggleLeadSidebar: []
  rename: [name: string]
}>()

const auth = useAuthStore()
const transferOpen = ref(false)
const transferSearch = ref('')
const transferPanel = ref<HTMLElement | null>(null)
const editingName = ref(false)
const nameDraft = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

const canAssign = computed(() => Boolean(props.chat.lead_id))
const canRename = computed(() => Boolean(props.chat.lead_id))
const isMine = computed(() => props.chat.owner_id === auth.user?.id)
const agentPaused = computed(() => Boolean(props.chat.whatsapp_agent_paused_at))
const isFinalized = computed(
  () => Boolean(props.chat.lead_id) && props.chat.owner_id == null && !agentPaused.value,
)
const canFinalize = computed(() => canAssign.value && !isFinalized.value)
const agentResumeLabel = computed(() => {
  if (!agentPaused.value) return null
  if (props.chat.whatsapp_agent_resume_at) {
    return `IA retorna em ${formatDateTime(props.chat.whatsapp_agent_resume_at)}`
  }
  return 'Agent pausado'
})

const filteredAttendants = computed(() => {
  const q = transferSearch.value.trim().toLowerCase()
  return props.attendants
    .filter((a) => a.id !== props.chat.owner_id)
    .filter((a) => !q || a.name.toLowerCase().includes(q))
})

const title = computed(
  () => props.chat.contact_name || props.chat.phone_number || props.chat.whatsapp_jid,
)

watch(
  () => props.chat.whatsapp_jid,
  () => {
    transferOpen.value = false
    transferSearch.value = ''
    editingName.value = false
  },
)

async function startRename() {
  if (!canRename.value || props.busy) return
  nameDraft.value = props.chat.contact_name?.trim() || title.value
  editingName.value = true
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}

function cancelRename() {
  editingName.value = false
  nameDraft.value = ''
}

function commitRename() {
  if (!editingName.value) return
  const next = nameDraft.value.trim()
  editingName.value = false
  if (!next || next === (props.chat.contact_name || '').trim()) return
  emit('rename', next)
}

function onDocPointerDown(event: PointerEvent) {
  if (!transferOpen.value || !transferPanel.value) return
  const target = event.target as Node | null
  if (target && !transferPanel.value.contains(target)) {
    transferOpen.value = false
  }
}

watch(transferOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onDocPointerDown)
  } else {
    document.removeEventListener('pointerdown', onDocPointerDown)
  }
})

onUnmounted(() => document.removeEventListener('pointerdown', onDocPointerDown))

function pickTransfer(ownerId: number) {
  emit('transfer', ownerId)
  transferOpen.value = false
  transferSearch.value = ''
}

function toggleAgent() {
  if (agentPaused.value) emit('resumeAgent')
  else emit('pauseAgent')
}
</script>

<template>
  <header class="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-brand-ink/10 px-4 py-3">
    <div class="min-w-0 flex-1">
      <input
        v-if="editingName"
        ref="nameInput"
        v-model="nameDraft"
        class="w-full max-w-md rounded-lg border border-brand-cyan/40 bg-white px-2 py-1 text-base font-semibold text-brand-ink outline-none focus:ring-2 focus:ring-brand-cyan/25"
        :disabled="busy"
        aria-label="Nome do lead"
        @keydown.enter.prevent="commitRename"
        @keydown.escape.prevent="cancelRename"
        @blur="commitRename"
      />
      <button
        v-else
        type="button"
        class="group flex max-w-full items-center gap-1.5 text-left"
        :class="canRename ? 'cursor-pointer' : 'cursor-default'"
        :disabled="!canRename || busy"
        :title="canRename ? 'Clique para editar o nome' : undefined"
        @click="startRename"
      >
        <h2 class="truncate text-base font-semibold text-brand-ink group-hover:underline group-hover:decoration-brand-ink/25 group-disabled:no-underline">
          {{ title }}
        </h2>
        <Icon
          v-if="canRename"
          icon="lucide:pencil"
          class="size-3.5 shrink-0 text-brand-ink/30 opacity-0 transition group-hover:opacity-100"
          aria-hidden="true"
        />
      </button>
      <p class="mt-0.5 text-xs text-brand-ink/50">
        <template v-if="chat.owner_name">Atendente: {{ chat.owner_name }}</template>
        <template v-else-if="isFinalized">Finalizado · Agent IA ativo</template>
        <template v-else-if="chat.lead_id">Sem atendente</template>
        <template v-else>Sem lead vinculado</template>
        <template v-if="agentResumeLabel"> · {{ agentResumeLabel }}</template>
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      <Button
        v-if="canFinalize"
        size="sm"
        variant="secondary"
        :loading="busy"
        icon="lucide:check-check"
        @click="emit('finalize')"
      >
        Finalizar
      </Button>

      <Button
        v-if="canAssign && !isMine"
        size="sm"
        variant="secondary"
        :loading="busy"
        icon="lucide:user-check"
        @click="emit('assume')"
      >
        Assumir
      </Button>

      <div v-if="canAssign" ref="transferPanel" class="relative">
        <button
          type="button"
          class="inline-flex size-9 items-center justify-center rounded-xl border border-brand-ink/10 bg-white text-brand-ink/60 transition hover:bg-[#f4f6f8] hover:text-brand-ink disabled:opacity-50"
          :class="transferOpen ? 'border-brand-cyan/40 bg-brand-cyan/10 text-brand-ink' : ''"
          :disabled="busy"
          title="Transferir"
          aria-label="Transferir conversa"
          @click="transferOpen = !transferOpen"
        >
          <Icon icon="lucide:arrow-right-left" class="size-4" aria-hidden="true" />
        </button>

        <div
          v-if="transferOpen"
          class="absolute top-full right-0 z-40 mt-1.5 w-56 overflow-hidden rounded-xl border border-brand-ink/10 bg-white shadow-lg"
        >
          <div class="border-b border-brand-ink/10 p-2">
            <input
              v-model="transferSearch"
              type="search"
              placeholder="Buscar atendente…"
              class="w-full rounded-lg border border-brand-ink/10 bg-[#f4f6f8] px-2.5 py-1.5 text-sm text-brand-ink outline-none focus:border-brand-cyan"
            />
          </div>
          <ul class="max-h-52 overflow-y-auto py-1">
            <li v-if="!filteredAttendants.length" class="px-3 py-2 text-xs text-brand-ink/45">
              Nenhum atendente.
            </li>
            <li v-for="a in filteredAttendants" :key="a.id">
              <button
                type="button"
                class="flex w-full px-3 py-2 text-left text-sm text-brand-ink transition hover:bg-[#f4f6f8]"
                @click="pickTransfer(a.id)"
              >
                {{ a.name }}
              </button>
            </li>
          </ul>
        </div>
      </div>

      <button
        v-if="canAssign"
        type="button"
        class="inline-flex h-9 items-center gap-1 rounded-xl border px-2.5 transition disabled:opacity-50"
        :class="
          agentPaused
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-800'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800'
        "
        :disabled="busy"
        :title="agentPaused ? 'Agent IA desativada' : 'Agent IA ativada'"
        :aria-label="agentPaused ? 'Agent IA desativada' : 'Agent IA ativada'"
        @click="toggleAgent"
      >
        <Icon icon="lucide:bot" class="size-4" aria-hidden="true" />
        <Icon
          :icon="agentPaused ? 'lucide:play' : 'lucide:pause'"
          class="size-3.5"
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        class="inline-flex size-9 items-center justify-center rounded-xl border border-brand-ink/10 bg-white text-brand-ink/60 transition hover:bg-[#f4f6f8] hover:text-brand-ink disabled:opacity-40"
        :class="leadSidebarOpen ? 'border-brand-cyan/40 bg-brand-cyan/10 text-brand-ink' : ''"
        :disabled="!chat.lead_id"
        title="Detalhes do lead"
        aria-label="Detalhes do lead"
        @click="emit('toggleLeadSidebar')"
      >
        <Icon icon="lucide:circle-help" class="size-4" aria-hidden="true" />
      </button>

      <span
        v-if="!canAssign"
        class="inline-flex items-center gap-1 text-xs text-brand-ink/40"
        title="Envie uma mensagem para vincular um lead"
      >
        <Icon icon="lucide:info" class="size-3.5" />
        Atribuição após lead
      </span>
    </div>
  </header>
</template>
