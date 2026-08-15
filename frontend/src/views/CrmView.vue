<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import { updateDeal } from '@/api/crm/deals'
import { moveLead } from '@/api/crm/leads'
import { getPipeline, listStages, reorderStages } from '@/api/crm/pipeline'
import { listSources } from '@/api/crm/sources'
import type {
  Deal,
  Lead,
  PipelineKind,
  PipelineStage,
  Source,
} from '@/api/crm/types'
import Button from '@/components/Buttons/Button.vue'
import PageView from '@/components/Layout/PageView.vue'
import CrmKanbanBoard from '@/components/crm/CrmKanbanBoard.vue'
import LeadFormModal from '@/components/Modals/LeadFormModal.vue'
import LostReasonModal from '@/components/Modals/LostReasonModal.vue'
import QuickNoteModal from '@/components/Modals/QuickNoteModal.vue'
import QuickTaskModal from '@/components/Modals/QuickTaskModal.vue'
import RecordDetailModal from '@/components/Modals/RecordDetailModal.vue'
import StageFormModal from '@/components/Modals/StageFormModal.vue'

type CrmTab = 'leads' | 'negocios'

const route = useRoute()
const router = useRouter()

const tabs: { id: CrmTab; label: string }[] = [
  { id: 'leads', label: 'Leads' },
  { id: 'negocios', label: 'Negócios' },
]

const tab = computed<CrmTab>({
  get() {
    const q = String(route.query.tab || 'leads')
    if (q === 'leads' || q === 'negocios') return q
    return 'leads'
  },
  set(value) {
    void router.replace({ query: { ...route.query, tab: value } })
  },
})

const sources = ref<Source[]>([])
const leadStages = ref<PipelineStage[]>([])
const dealStages = ref<PipelineStage[]>([])

const loadingLeads = ref(true)
const loadingDeals = ref(true)
const errorLeads = ref('')
const errorDeals = ref('')

const searchLeads = ref('')
const searchDeals = ref('')

const leadFormOpen = ref(false)
const stageFormOpen = ref(false)
const stageFormKind = ref<PipelineKind>('lead')
const editingStage = ref<PipelineStage | null>(null)
const detailOpen = ref(false)
const detailKind = ref<'lead' | 'deal'>('lead')
const detailId = ref<number | null>(null)
const quickTaskOpen = ref(false)
const quickNoteOpen = ref(false)
const quickLeadId = ref<number | null>(null)
const quickDealId = ref<number | null>(null)
const lostOpen = ref(false)

type PendingMove = {
  kind: PipelineKind
  id: number
  stageId: number
  fromStageId: number
}
const pendingMove = ref<PendingMove | null>(null)

async function loadSources() {
  try {
    sources.value = await listSources()
  } catch {
    sources.value = []
  }
}

async function loadLeadsPipeline(options?: { silent?: boolean }) {
  if (!options?.silent) loadingLeads.value = true
  errorLeads.value = ''
  try {
    leadStages.value = await getPipeline({
      kind: 'lead',
      search: searchLeads.value.trim() || undefined,
    })
  } catch (error) {
    errorLeads.value =
      error instanceof ApiError ? error.message : 'Não foi possível carregar os leads.'
  } finally {
    if (!options?.silent) loadingLeads.value = false
  }
}

async function loadDealsPipeline(options?: { silent?: boolean }) {
  if (!options?.silent) loadingDeals.value = true
  errorDeals.value = ''
  try {
    dealStages.value = await getPipeline({
      kind: 'deal',
      search: searchDeals.value.trim() || undefined,
    })
  } catch (error) {
    errorDeals.value =
      error instanceof ApiError ? error.message : 'Não foi possível carregar os negócios.'
  } finally {
    if (!options?.silent) loadingDeals.value = false
  }
}

async function loadCurrentTab() {
  if (tab.value === 'leads') await loadLeadsPipeline()
  else await loadDealsPipeline()
}

watch(tab, () => {
  void loadCurrentTab()
})

watch(
  () => route.query.tab,
  () => {
    const q = String(route.query.tab || '')
    if (q === 'dashboard' || q === 'contatos') {
      void router.replace({ query: { ...route.query, tab: 'leads' } })
    }
  },
  { immediate: true },
)

onMounted(() => {
  void loadSources()
  void listStages('deal')
    .then((stages) => {
      if (!dealStages.value.length) dealStages.value = stages
    })
    .catch(() => undefined)
  void loadCurrentTab()
})
function openDetail(kind: 'lead' | 'deal', id: number) {
  detailKind.value = kind
  detailId.value = id
  detailOpen.value = true
}

function findStage(kind: PipelineKind, id: number): PipelineStage | undefined {
  const list = kind === 'lead' ? leadStages.value : dealStages.value
  return list.find((s) => s.id === id)
}

/** Mantém o estado do pai alinhado ao drag (sem trocar a ref da lista). */
function applyLocalMove(move: PendingMove) {
  const stages = move.kind === 'lead' ? leadStages : dealStages
  let card: Lead | Deal | undefined

  for (const stage of stages.value) {
    const list = move.kind === 'lead' ? stage.leads : stage.deals
    if (!list?.length) continue
    const idx = list.findIndex((c) => c.id === move.id)
    if (idx >= 0) {
      card = list.splice(idx, 1)[0]
      break
    }
  }

  if (!card) return

  card.stage_id = move.stageId
  const target = stages.value.find((s) => s.id === move.stageId)
  if (!target) return

  if (move.kind === 'lead') {
    const list = target.leads ?? []
    if (!list.some((c) => c.id === card.id)) list.push(card as Lead)
    target.leads = list
  } else {
    const list = target.deals ?? []
    if (!list.some((c) => c.id === card.id)) list.push(card as Deal)
    target.deals = list
  }
}

async function applyMove(move: PendingMove, lostReason?: string) {
  try {
    if (move.kind === 'lead') {
      await moveLead(move.id, {
        stage_id: move.stageId,
        lost_reason: lostReason,
      })
    } else {
      await updateDeal(move.id, {
        stage_id: move.stageId,
        lost_reason: lostReason,
      })
    }
  } catch (error) {
    const msg = error instanceof ApiError ? error.message : 'Não foi possível mover o card.'
    if (move.kind === 'lead') {
      errorLeads.value = msg
      await loadLeadsPipeline({ silent: true })
    } else {
      errorDeals.value = msg
      await loadDealsPipeline({ silent: true })
    }
  }
}

function onMoveCard(payload: PendingMove) {
  applyLocalMove(payload)
  const target = findStage(payload.kind, payload.stageId)
  if (target?.is_lost) {
    pendingMove.value = payload
    lostOpen.value = true
    return
  }
  void applyMove(payload)
}

function onLostConfirm(reason: string) {
  if (!pendingMove.value) return
  const move = pendingMove.value
  pendingMove.value = null
  void applyMove(move, reason)
}

function onLostCancel() {
  pendingMove.value = null
  if (tab.value === 'leads') void loadLeadsPipeline({ silent: true })
  else if (tab.value === 'negocios') void loadDealsPipeline({ silent: true })
}

async function onReorderStages(kind: PipelineKind, orderedIds: number[]) {
  try {
    await reorderStages(kind, orderedIds)
  } catch (error) {
    const msg =
      error instanceof ApiError ? error.message : 'Não foi possível reordenar as colunas.'
    if (kind === 'lead') {
      errorLeads.value = msg
      await loadLeadsPipeline({ silent: true })
    } else {
      errorDeals.value = msg
      await loadDealsPipeline({ silent: true })
    }
  }
}

function openNewStage(kind: PipelineKind) {
  stageFormKind.value = kind
  editingStage.value = null
  stageFormOpen.value = true
}

function openEditStage(kind: PipelineKind, stage: PipelineStage) {
  stageFormKind.value = kind
  editingStage.value = stage
  stageFormOpen.value = true
}
</script>

<template>
  <PageView title="CRM">
    <template #actions>
      <Button
        v-if="tab === 'leads'"
        icon="lucide:user-plus"
        @click="leadFormOpen = true"
      >
        Novo lead
      </Button>
      <Button
        variant="secondary"
        icon="lucide:refresh-cw"
        @click="loadCurrentTab"
      >
        Atualizar
      </Button>
    </template>

    <div class="flex min-h-0 flex-1 flex-col gap-4">
      <div class="flex flex-wrap gap-1 rounded-2xl border border-brand-ink/10 bg-white p-1">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          class="rounded-xl px-4 py-2 text-sm font-medium transition"
          :class="
            tab === t.id
              ? 'bg-brand-cyan text-brand-ink'
              : 'text-brand-ink/55 hover:bg-[#f4f6f8] hover:text-brand-ink'
          "
          @click="tab = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <CrmKanbanBoard
        v-if="tab === 'leads'"
        kind="lead"
        :stages="leadStages"
        :loading="loadingLeads"
        :error="errorLeads"
        :search="searchLeads"
        @update:search="searchLeads = $event"
        @search="loadLeadsPipeline"
        @open-card="openDetail($event.kind === 'lead' ? 'lead' : 'deal', $event.id)"
        @move-card="onMoveCard"
        @reorder-stages="onReorderStages('lead', $event)"
        @new-stage="openNewStage('lead')"
        @edit-stage="openEditStage('lead', $event)"
        @quick-task="
          quickLeadId = $event.leadId ?? null;
          quickDealId = null;
          quickTaskOpen = true
        "
        @quick-note="
          quickLeadId = $event.leadId ?? null;
          quickDealId = null;
          quickNoteOpen = true
        "
      />

      <CrmKanbanBoard
        v-else
        kind="deal"
        :stages="dealStages"
        :loading="loadingDeals"
        :error="errorDeals"
        :search="searchDeals"
        @update:search="searchDeals = $event"
        @search="loadDealsPipeline"
        @open-card="openDetail('deal', $event.id)"
        @move-card="onMoveCard"
        @reorder-stages="onReorderStages('deal', $event)"
        @new-stage="openNewStage('deal')"
        @edit-stage="openEditStage('deal', $event)"
        @quick-task="
          quickDealId = $event.dealId ?? null;
          quickLeadId = null;
          quickTaskOpen = true
        "
        @quick-note="
          quickDealId = $event.dealId ?? null;
          quickLeadId = null;
          quickNoteOpen = true
        "
      />
    </div>

    <LeadFormModal v-model:open="leadFormOpen" :sources="sources" @saved="loadLeadsPipeline" />
    <StageFormModal
      v-model:open="stageFormOpen"
      :kind="stageFormKind"
      :stage="editingStage"
      @saved="stageFormKind === 'lead' ? loadLeadsPipeline() : loadDealsPipeline()"
    />
    <RecordDetailModal
      v-model:open="detailOpen"
      :kind="detailKind"
      :record-id="detailId"
      :sources="sources"
      :deal-stages="dealStages"
      @saved="loadCurrentTab"
      @deleted="loadCurrentTab"
      @converted="
        tab = 'negocios';
        loadDealsPipeline()
      "
    />
    <QuickTaskModal
      v-model:open="quickTaskOpen"
      :lead-id="quickLeadId"
      :deal-id="quickDealId"
      @saved="loadCurrentTab"
    />
    <QuickNoteModal
      v-model:open="quickNoteOpen"
      :lead-id="quickLeadId"
      :deal-id="quickDealId"
      @saved="loadCurrentTab"
    />
    <LostReasonModal
      v-model:open="lostOpen"
      @confirm="onLostConfirm"
      @cancel="onLostCancel"
    />
  </PageView>
</template>
