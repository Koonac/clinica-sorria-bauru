<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import { getLead } from '@/api/crm/leads'
import type { Lead } from '@/api/crm/types'
import Skeleton from '@/components/Feedback/Skeleton.vue'
import QuickNoteModal from '@/components/Modals/QuickNoteModal.vue'
import { formatDateTime } from '@/utils/crmFormat'

const props = defineProps<{
  leadId: number
}>()

const emit = defineEmits<{
  close: []
}>()

const lead = ref<Lead | null>(null)
const loading = ref(true)
const error = ref('')
const noteOpen = ref(false)

const notes = computed(() => (lead.value?.activities || []).filter((a) => a.type === 'note'))

const agentLabel = computed(() => {
  if (!lead.value) return '—'
  if (lead.value.whatsapp_agent_paused_at) {
    if (lead.value.whatsapp_agent_resume_at) {
      return `Pausado · retorna ${formatDateTime(lead.value.whatsapp_agent_resume_at)}`
    }
    return 'Pausado (humano)'
  }
  return 'Ativo'
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    lead.value = await getLead(props.leadId)
  } catch (e) {
    lead.value = null
    error.value = e instanceof ApiError ? e.message : 'Não foi possível carregar o lead.'
  } finally {
    loading.value = false
  }
}

watch(
  () => props.leadId,
  () => {
    void load()
  },
  { immediate: true },
)
</script>

<template>
  <aside
    class="flex w-full shrink-0 flex-col border-t border-brand-ink/10 bg-white md:w-80 md:border-t-0 md:border-l"
  >
    <div class="flex shrink-0 items-center justify-between gap-2 border-b border-brand-ink/10 px-3 py-2.5">
      <h3 class="text-sm font-semibold text-brand-ink">Detalhes do lead</h3>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="inline-flex size-8 items-center justify-center rounded-lg text-brand-ink/55 transition hover:bg-[#f4f6f8] hover:text-brand-ink disabled:opacity-40"
          :disabled="!leadId"
          title="Nova anotação"
          aria-label="Nova anotação"
          @click="noteOpen = true"
        >
          <Icon icon="lucide:plus" class="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="inline-flex size-8 items-center justify-center rounded-lg text-brand-ink/55 transition hover:bg-[#f4f6f8] hover:text-brand-ink"
          aria-label="Fechar"
          @click="emit('close')"
        >
          <Icon icon="lucide:x" class="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-3">
      <div v-if="loading" class="space-y-2" role="status" aria-busy="true">
        <Skeleton class="h-5 w-2/3 rounded-lg" />
        <Skeleton class="h-4 w-full rounded-lg" />
        <Skeleton class="h-4 w-5/6 rounded-lg" />
        <Skeleton class="mt-4 h-20 w-full rounded-xl" />
      </div>

      <p v-else-if="error" class="text-sm text-red-600">{{ error }}</p>

      <template v-else-if="lead">
        <dl class="space-y-2.5 text-sm">
          <div>
            <dt class="text-[11px] font-medium tracking-wide text-brand-ink/40 uppercase">Nome</dt>
            <dd class="mt-0.5 font-medium text-brand-ink">{{ lead.name || '—' }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium tracking-wide text-brand-ink/40 uppercase">WhatsApp</dt>
            <dd class="mt-0.5 break-all text-brand-ink">
              {{ lead.whatsapp_jid || lead.mobile || '—' }}
            </dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium tracking-wide text-brand-ink/40 uppercase">E-mail</dt>
            <dd class="mt-0.5 text-brand-ink">{{ lead.email || '—' }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium tracking-wide text-brand-ink/40 uppercase">Origem</dt>
            <dd class="mt-0.5 text-brand-ink">{{ lead.source?.name || '—' }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium tracking-wide text-brand-ink/40 uppercase">Valor</dt>
            <dd class="mt-0.5 text-brand-ink">
              <template v-if="lead.value != null && lead.value !== ''">
                {{ lead.value }} {{ lead.currency || 'BRL' }}
              </template>
              <template v-else>—</template>
            </dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium tracking-wide text-brand-ink/40 uppercase">
              Atendente
            </dt>
            <dd class="mt-0.5 text-brand-ink">{{ lead.owner?.name || 'Sem dono' }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium tracking-wide text-brand-ink/40 uppercase">
              Agent IA
            </dt>
            <dd class="mt-0.5 text-brand-ink">{{ agentLabel }}</dd>
          </div>
        </dl>

        <section class="mt-5">
          <h4 class="text-[11px] font-medium tracking-wide text-brand-ink/40 uppercase">
            Anotações
          </h4>
          <p v-if="!notes.length" class="mt-2 text-sm text-brand-ink/45">Nenhuma anotação.</p>
          <ul v-else class="mt-2 space-y-2">
            <li
              v-for="n in notes"
              :key="n.id"
              class="rounded-xl border border-brand-ink/10 bg-[#f8fafb] px-3 py-2"
            >
              <p class="text-[10px] text-brand-ink/40">
                {{ formatDateTime(n.created_at)
                }}<template v-if="n.user?.name"> · {{ n.user.name }}</template>
              </p>
              <p class="mt-1 text-sm text-brand-ink">{{ n.body || n.subject || '—' }}</p>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <QuickNoteModal v-model:open="noteOpen" :lead-id="leadId" @saved="load" />
  </aside>
</template>
