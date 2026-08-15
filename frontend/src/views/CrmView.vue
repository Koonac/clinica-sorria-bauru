<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import { listContacts } from '@/api/crm/contacts'
import { updateDeal } from '@/api/crm/deals'
import { moveLead } from '@/api/crm/leads'
import { getPipeline, listStages, reorderStages } from '@/api/crm/pipeline'
import { listSources } from '@/api/crm/sources'
import { getLeadsPorDia } from '@/api/crm/stats'
import { listLeads } from '@/api/crm/leads'
import type {
  Contact,
  LeadsPorDiaPoint,
  PipelineKind,
  PipelineStage,
  Source,
} from '@/api/crm/types'
import Button from '@/components/Buttons/Button.vue'
import PageView from '@/components/Layout/PageView.vue'
import ContactDetailModal from '@/components/Modals/ContactDetailModal.vue'
import CrmContactsPanel from '@/components/crm/CrmContactsPanel.vue'
import CrmDashboardPanel from '@/components/crm/CrmDashboardPanel.vue'
import CrmKanbanBoard from '@/components/crm/CrmKanbanBoard.vue'
import LeadFormModal from '@/components/Modals/LeadFormModal.vue'
import LostReasonModal from '@/components/Modals/LostReasonModal.vue'
import QuickNoteModal from '@/components/Modals/QuickNoteModal.vue'
import QuickTaskModal from '@/components/Modals/QuickTaskModal.vue'
import RecordDetailModal from '@/components/Modals/RecordDetailModal.vue'
import StageFormModal from '@/components/Modals/StageFormModal.vue'

type CrmTab = 'dashboard' | 'leads' | 'negocios' | 'contatos'

const route = useRoute()
const router = useRouter()

const tabs: { id: CrmTab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'leads', label: 'Leads' },
  { id: 'negocios', label: 'Negócios' },
  { id: 'contatos', label: 'Contatos' },
]

const tab = computed<CrmTab>({
  get() {
    const q = String(route.query.tab || 'dashboard')
    if (q === 'leads' || q === 'negocios' || q === 'contatos' || q === 'dashboard') return q
    return 'dashboard'
  },
  set(value) {
    void router.replace({ query: { ...route.query, tab: value } })
  },
})

const sources = ref<Source[]>([])
const leadStages = ref<PipelineStage[]>([])
const dealStages = ref<PipelineStage[]>([])
const contacts = ref<Contact[]>([])
const contactTotal = ref(0)
const convertedTotal = ref(0)
const leadsPorDia = ref<LeadsPorDiaPoint[]>([])

const loadingDash = ref(false)
const loadingLeads = ref(false)
const loadingDeals = ref(false)
const loadingContacts = ref(false)
const errorDash = ref('')
const errorLeads = ref('')
const errorDeals = ref('')
const errorContacts = ref('')

const searchLeads = ref('')
const searchDeals = ref('')
const searchContacts = ref('')

const leadFormOpen = ref(false)
const stageFormOpen = ref(false)
const stageFormKind = ref<PipelineKind>('lead')
const editingStage = ref<PipelineStage | null>(null)
const detailOpen = ref(false)
const detailKind = ref<'lead' | 'deal'>('lead')
const detailId = ref<number | null>(null)
const contactOpen = ref(false)
const selectedContact = ref<Contact | null>(null)
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

async function loadDashboard() {
  loadingDash.value = true
  errorDash.value = ''
  try {
    const [contactsPage, pipelineDeal, pipelineLead, serie, converted] = await Promise.all([
      listContacts(),
      getPipeline({ kind: 'deal' }),
      getPipeline({ kind: 'lead' }),
      getLeadsPorDia(30),
      listLeads({ status: 'converted' }),
    ])
    contactTotal.value = contactsPage.total
    dealStages.value = pipelineDeal
    leadStages.value = pipelineLead
    leadsPorDia.value = serie.data
    convertedTotal.value = converted.total
  } catch (error) {
    errorDash.value =
      error instanceof ApiError ? error.message : 'Não foi possível carregar o dashboard.'
  } finally {
    loadingDash.value = false
  }
}

async function loadLeadsPipeline() {
  loadingLeads.value = true
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
    loadingLeads.value = false
  }
}

async function loadDealsPipeline() {
  loadingDeals.value = true
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
    loadingDeals.value = false
  }
}

async function loadContactsList() {
  loadingContacts.value = true
  errorContacts.value = ''
  try {
    const page = await listContacts({
      search: searchContacts.value.trim() || undefined,
    })
    contacts.value = page.data
    contactTotal.value = page.total
  } catch (error) {
    errorContacts.value =
      error instanceof ApiError ? error.message : 'Não foi possível carregar os contatos.'
  } finally {
    loadingContacts.value = false
  }
}

async function loadCurrentTab() {
  if (tab.value === 'dashboard') await loadDashboard()
  else if (tab.value === 'leads') await loadLeadsPipeline()
  else if (tab.value === 'negocios') await loadDealsPipeline()
  else await loadContactsList()
}

watch(tab, () => {
  void loadCurrentTab()
})

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

async function applyMove(move: PendingMove, lostReason?: string) {
  try {
    if (move.kind === 'lead') {
      await moveLead(move.id, {
        stage_id: move.stageId,
        lost_reason: lostReason,
      })
      await loadLeadsPipeline()
    } else {
      await updateDeal(move.id, {
        stage_id: move.stageId,
        lost_reason: lostReason,
      })
      await loadDealsPipeline()
    }
  } catch (error) {
    const msg = error instanceof ApiError ? error.message : 'Não foi possível mover o card.'
    if (move.kind === 'lead') {
      errorLeads.value = msg
      await loadLeadsPipeline()
    } else {
      errorDeals.value = msg
      await loadDealsPipeline()
    }
  }
}

function onMoveCard(payload: PendingMove) {
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
  if (tab.value === 'leads') void loadLeadsPipeline()
  else if (tab.value === 'negocios') void loadDealsPipeline()
}

async function onReorderStages(kind: PipelineKind, orderedIds: number[]) {
  try {
    await reorderStages(kind, orderedIds)
  } catch (error) {
    const msg =
      error instanceof ApiError ? error.message : 'Não foi possível reordenar as colunas.'
    if (kind === 'lead') {
      errorLeads.value = msg
      await loadLeadsPipeline()
    } else {
      errorDeals.value = msg
      await loadDealsPipeline()
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

      <CrmDashboardPanel
        v-if="tab === 'dashboard'"
        :loading="loadingDash"
        :error="errorDash"
        :contact-total="contactTotal"
        :lead-stages="leadStages"
        :deal-stages="dealStages"
        :converted-total="convertedTotal"
        :leads-por-dia="leadsPorDia"
      />

      <CrmKanbanBoard
        v-else-if="tab === 'leads'"
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
        v-else-if="tab === 'negocios'"
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

      <CrmContactsPanel
        v-else
        :contacts="contacts"
        :loading="loadingContacts"
        :error="errorContacts"
        :search="searchContacts"
        @update:search="searchContacts = $event"
        @search="loadContactsList"
        @open="
          selectedContact = $event;
          contactOpen = true
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
    <ContactDetailModal v-model:open="contactOpen" :contact="selectedContact" />
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
