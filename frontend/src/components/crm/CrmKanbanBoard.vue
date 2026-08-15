<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import draggable from 'vuedraggable'
import type { Deal, Lead, PipelineKind, PipelineStage } from '@/api/crm/types'
import { formatMoney } from '@/api/crm/types'
import ContentSkeleton from '@/components/Feedback/ContentSkeleton.vue'
import { daysSince, formatDateTime } from '@/utils/crmFormat'

const props = defineProps<{
  kind: PipelineKind
  stages: PipelineStage[]
  loading: boolean
  error: string
  search: string
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  search: []
  refresh: []
  'open-card': [payload: { kind: PipelineKind; id: number }]
  'move-card': [payload: { kind: PipelineKind; id: number; stageId: number; fromStageId: number }]
  'reorder-stages': [orderedIds: number[]]
  'new-stage': []
  'edit-stage': [stage: PipelineStage]
  'quick-task': [payload: { leadId?: number; dealId?: number }]
  'quick-note': [payload: { leadId?: number; dealId?: number }]
}>()

const localStages = ref<PipelineStage[]>([])
const pendingMoveIds = ref(new Set<number>())

function cloneStages(value: PipelineStage[]): PipelineStage[] {
  return value.map((s) => ({
    ...s,
    leads: (s.leads || []).map((l) => ({ ...l })),
    deals: (s.deals || []).map((d) => ({ ...d })),
  }))
}

// Só re-sincroniza quando o pai troca a lista (load), não em mutações profundas —
// senão o drag otimista “volta” o card e stage_id fica dessincronizado.
watch(
  () => props.stages,
  (value) => {
    localStages.value = cloneStages(value)
  },
  { immediate: true },
)

const stageList = computed({
  get: () => localStages.value,
  set: (value) => {
    localStages.value = value
    emit(
      'reorder-stages',
      value.map((s) => s.id),
    )
  },
})

function cardsOf(stage: PipelineStage): Array<Lead | Deal> {
  return props.kind === 'lead' ? stage.leads || [] : stage.deals || []
}

function cardTitle(card: Lead | Deal): string {
  if (props.kind === 'lead') return (card as Lead).name || (card as Lead).title
  return (card as Deal).title
}

function cardValue(card: Lead | Deal): string | number | null | undefined {
  return card.value
}

function isLead(card: Lead | Deal): card is Lead {
  return props.kind === 'lead'
}

function onCardChange(stage: PipelineStage, evt: { added?: { element: Lead | Deal } }) {
  if (!evt.added) return
  const card = evt.added.element
  if (pendingMoveIds.value.has(card.id)) return

  const fromStageId = Number(card.stage_id)
  if (!fromStageId || fromStageId === stage.id) return

  pendingMoveIds.value.add(card.id)
  card.stage_id = stage.id

  emit('move-card', {
    kind: props.kind,
    id: card.id,
    stageId: stage.id,
    fromStageId,
  })

  // Libera após o tick para não engolir o change espelho do Sortable
  queueMicrotask(() => {
    pendingMoveIds.value.delete(card.id)
  })
}

function stageSum(stage: PipelineStage): number {
  return cardsOf(stage).reduce((sum, c) => sum + (Number(c.value) || 0), 0)
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4">
    <form class="flex flex-wrap items-center gap-2" @submit.prevent="emit('search')">
      <label class="relative min-w-[16rem] flex-1">
        <Icon
          icon="lucide:search"
          class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-brand-ink/35"
          aria-hidden="true"
        />
        <input
          :value="search"
          type="search"
          :placeholder="kind === 'lead' ? 'Buscar leads…' : 'Buscar negócios…'"
          class="w-full rounded-xl border border-brand-ink/15 bg-white py-2.5 pr-4 pl-10 text-sm outline-none focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
          @input="emit('update:search', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <button
        type="submit"
        class="rounded-full border border-brand-ink/15 bg-white px-4 py-2.5 text-sm font-medium text-brand-ink/70 hover:bg-[#f4f6f8]"
      >
        Buscar
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full border border-brand-ink/15 bg-white px-4 py-2.5 text-sm font-medium text-brand-ink/70 hover:bg-[#f4f6f8]"
        @click="emit('new-stage')"
      >
        <Icon icon="lucide:plus" class="size-4" />
        Nova coluna
      </button>
    </form>

    <p v-if="error" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </p>

    <ContentSkeleton v-if="loading" variant="kanban" />

    <div v-else class="min-h-0 flex-1 overflow-x-auto pb-2">
      <draggable
        v-model="stageList"
        item-key="id"
        class="flex h-full min-h-[28rem] gap-3"
        ghost-class="opacity-40"
        handle=".stage-handle"
      >
        <template #item="{ element: stage }">
          <section
            class="flex w-72 shrink-0 flex-col rounded-2xl border border-brand-ink/10 bg-[#f8fafb]"
          >
            <header class="flex items-start gap-2 border-b border-brand-ink/8 px-3 py-3">
              <button
                type="button"
                class="stage-handle mt-0.5 cursor-grab text-brand-ink/30 hover:text-brand-ink/55"
                aria-label="Reordenar coluna"
              >
                <Icon icon="lucide:grip-vertical" class="size-4" />
              </button>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span
                    class="size-2.5 shrink-0 rounded-full"
                    :style="{ background: stage.color || '#6b7280' }"
                  />
                  <h3 class="truncate text-sm font-semibold text-brand-ink">{{ stage.name }}</h3>
                  <span class="text-xs text-brand-ink/40">{{ cardsOf(stage).length }}</span>
                </div>
                <p v-if="kind === 'deal'" class="mt-1 text-xs text-brand-ink/45">
                  {{ formatMoney(stageSum(stage)) }}
                </p>
              </div>
              <button
                type="button"
                class="rounded-lg p-1.5 text-brand-ink/35 hover:bg-white hover:text-brand-ink"
                aria-label="Editar coluna"
                @click="emit('edit-stage', stage)"
              >
                <Icon icon="lucide:pencil" class="size-3.5" />
              </button>
            </header>

            <draggable
              :list="kind === 'lead' ? stage.leads : stage.deals"
              item-key="id"
              group="crm-cards"
              class="flex min-h-[12rem] flex-1 flex-col gap-2 overflow-y-auto p-2"
              ghost-class="opacity-40"
              :animation="150"
              @change="(e: { added?: { element: Lead | Deal } }) => onCardChange(stage, e)"
            >
              <template #item="{ element: card }">
                <article
                  class="cursor-pointer rounded-xl border border-brand-ink/10 bg-white p-3 shadow-sm transition hover:border-brand-cyan/40"
                  @click="emit('open-card', { kind, id: card.id })"
                >
                  <div class="flex items-start justify-between gap-2">
                    <h4 class="text-sm font-medium text-brand-ink">{{ cardTitle(card) }}</h4>
                    <div class="flex shrink-0 gap-0.5">
                      <button
                        type="button"
                        class="rounded-md p-1 text-brand-ink/35 hover:bg-[#f4f6f8] hover:text-brand-ink"
                        title="Nova tarefa"
                        @click.stop="
                          emit('quick-task', {
                            leadId: kind === 'lead' ? card.id : undefined,
                            dealId: kind === 'deal' ? card.id : undefined,
                          })
                        "
                      >
                        <Icon icon="lucide:check-square" class="size-3.5" />
                      </button>
                      <button
                        type="button"
                        class="rounded-md p-1 text-brand-ink/35 hover:bg-[#f4f6f8] hover:text-brand-ink"
                        title="Nova nota"
                        @click.stop="
                          emit('quick-note', {
                            leadId: kind === 'lead' ? card.id : undefined,
                            dealId: kind === 'deal' ? card.id : undefined,
                          })
                        "
                      >
                        <Icon icon="lucide:sticky-note" class="size-3.5" />
                      </button>
                    </div>
                  </div>

                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <span
                      v-if="isLead(card) ? card.whatsapp_jid || card.mobile : (card as Deal).whatsapp_jid"
                      class="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                    >
                      <Icon icon="lucide:message-circle" class="size-3" />
                      WA
                    </span>
                    <span
                      v-if="isLead(card) && card.instagram"
                      class="inline-flex items-center gap-1 rounded-md bg-pink-50 px-1.5 py-0.5 text-[10px] font-medium text-pink-700"
                    >
                      <Icon icon="lucide:instagram" class="size-3" />
                      IG
                    </span>
                  </div>

                  <div class="mt-2 flex items-center justify-between gap-2 text-xs text-brand-ink/50">
                    <span>{{ formatMoney(cardValue(card)) }}</span>
                    <span v-if="isLead(card) && card.source">{{ card.source.name }}</span>
                  </div>

                  <p
                    v-if="card.next_pending_task"
                    class="mt-2 truncate text-[11px] text-brand-cyan-ink"
                  >
                    {{ card.next_pending_task.title }} ·
                    {{ formatDateTime(card.next_pending_task.due_at) }}
                  </p>
                  <p
                    v-else-if="isLead(card) && card.created_at"
                    class="mt-2 text-[11px] text-brand-ink/40"
                  >
                    {{ daysSince(card.created_at) }}d no CRM
                  </p>
                </article>
              </template>
            </draggable>
          </section>
        </template>
      </draggable>
    </div>
  </div>
</template>
