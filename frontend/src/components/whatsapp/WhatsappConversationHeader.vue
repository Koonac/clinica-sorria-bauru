<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import type { CrmAttendant, WhatsappChat } from '@/api/crm/types'
import Button from '@/components/Buttons/Button.vue'
import Select from '@/components/Forms/Select.vue'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  chat: WhatsappChat
  attendants: CrmAttendant[]
  busy?: boolean
}>()

const emit = defineEmits<{
  assume: []
  transfer: [ownerId: number]
  pauseAgent: []
  resumeAgent: []
}>()

const auth = useAuthStore()
const transferTo = ref<string | number>('')

const canAssign = computed(() => Boolean(props.chat.lead_id))
const isMine = computed(() => props.chat.owner_id === auth.user?.id)
const agentPaused = computed(() => Boolean(props.chat.whatsapp_agent_paused_at))

const attendantOptions = computed(() => [
  { value: '', label: 'Transferir para…' },
  ...props.attendants
    .filter((a) => a.id !== props.chat.owner_id)
    .map((a) => ({ value: a.id, label: a.name })),
])

const title = computed(
  () => props.chat.contact_name || props.chat.phone_number || props.chat.whatsapp_jid,
)

watch(
  () => props.chat.whatsapp_jid,
  () => {
    transferTo.value = ''
  },
)

function onTransfer() {
  const id = Number(transferTo.value)
  if (!id) return
  emit('transfer', id)
  transferTo.value = ''
}
</script>

<template>
  <header class="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-brand-ink/10 px-4 py-3">
    <div class="min-w-0">
      <h2 class="truncate text-base font-semibold text-brand-ink">{{ title }}</h2>
      <p class="mt-0.5 text-xs text-brand-ink/50">
        <template v-if="chat.owner_name">Atendente: {{ chat.owner_name }}</template>
        <template v-else-if="chat.lead_id">Sem atendente</template>
        <template v-else>Sem lead vinculado</template>
        <template v-if="agentPaused"> · Agent pausado</template>
      </p>
      <div v-if="chat.lead_id || chat.deal_id" class="mt-1 flex flex-wrap gap-2 text-xs">
        <span v-if="chat.lead_id" class="text-brand-ink/45">Lead #{{ chat.lead_id }}</span>
        <span v-if="chat.deal_id" class="text-brand-ink/45">Negócio #{{ chat.deal_id }}</span>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
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

      <div v-if="canAssign" class="flex items-center gap-1.5">
        <div class="w-40">
          <Select v-model="transferTo" :options="attendantOptions" placeholder="Transferir…" />
        </div>
        <Button
          size="sm"
          variant="secondary"
          :disabled="!transferTo || busy"
          icon="lucide:arrow-right-left"
          @click="onTransfer"
        >
          Ok
        </Button>
      </div>

      <Button
        v-if="canAssign && !agentPaused"
        size="sm"
        variant="secondary"
        :loading="busy"
        icon="lucide:pause"
        @click="emit('pauseAgent')"
      >
        Pausar agent
      </Button>
      <Button
        v-else-if="canAssign && agentPaused"
        size="sm"
        variant="secondary"
        :loading="busy"
        icon="lucide:play"
        @click="emit('resumeAgent')"
      >
        Retomar agent
      </Button>

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
