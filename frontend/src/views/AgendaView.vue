<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import { getPipeline } from '@/api/crm/pipeline'
import { listTasks } from '@/api/crm/tasks'
import type { CrmTask } from '@/api/crm/types'
import TaskEventModal from '@/components/Modals/TaskEventModal.vue'
import Button from '@/components/Buttons/Button.vue'
import PageView from '@/components/Layout/PageView.vue'
import { endOfMonth, monthGrid, startOfMonth, ymd } from '@/utils/crmFormat'

const visibleMonth = ref(startOfMonth(new Date()))
const tasks = ref<CrmTask[]>([])
const loading = ref(false)
const error = ref('')
const pendingOnly = ref(false)
const modalOpen = ref(false)
const editingTask = ref<CrmTask | null>(null)
const defaultDueAt = ref<string | null>(null)
const leadOptions = ref<Array<{ id: number; label: string }>>([])
const dealOptions = ref<Array<{ id: number; label: string }>>([])

const monthLabel = computed(() =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(visibleMonth.value),
)

const cells = computed(() => monthGrid(visibleMonth.value))
const todayYmd = ymd(new Date())

const tasksByDay = computed(() => {
  const map = new Map<string, CrmTask[]>()
  for (const task of tasks.value) {
    const key = ymd(new Date(task.due_at))
    const list = map.get(key) || []
    list.push(task)
    map.set(key, list)
  }
  return map
})

const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

async function loadOptions() {
  try {
    const [leads, deals] = await Promise.all([
      getPipeline({ kind: 'lead' }),
      getPipeline({ kind: 'deal' }),
    ])
    leadOptions.value = leads.flatMap((s) =>
      (s.leads || []).map((l) => ({ id: l.id, label: l.name || l.title })),
    )
    dealOptions.value = deals.flatMap((s) =>
      (s.deals || []).map((d) => ({ id: d.id, label: d.title })),
    )
  } catch {
    leadOptions.value = []
    dealOptions.value = []
  }
}

async function loadTasks() {
  loading.value = true
  error.value = ''
  try {
    const from = startOfMonth(visibleMonth.value)
    const to = endOfMonth(visibleMonth.value)
    tasks.value = await listTasks({
      due_from: ymd(from),
      due_to: ymd(to),
      pending: pendingOnly.value || undefined,
    })
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Não foi possível carregar a agenda.'
  } finally {
    loading.value = false
  }
}

function prevMonth() {
  const d = new Date(visibleMonth.value)
  d.setMonth(d.getMonth() - 1)
  visibleMonth.value = startOfMonth(d)
}

function nextMonth() {
  const d = new Date(visibleMonth.value)
  d.setMonth(d.getMonth() + 1)
  visibleMonth.value = startOfMonth(d)
}

function goToday() {
  visibleMonth.value = startOfMonth(new Date())
}

function openNew(day?: Date) {
  editingTask.value = null
  if (day) {
    const d = new Date(day)
    d.setHours(9, 0, 0, 0)
    defaultDueAt.value = d.toISOString()
  } else {
    defaultDueAt.value = null
  }
  modalOpen.value = true
}

function openTask(task: CrmTask) {
  editingTask.value = task
  defaultDueAt.value = null
  modalOpen.value = true
}

function dayTasks(day: Date): CrmTask[] {
  return tasksByDay.value.get(ymd(day)) || []
}

function isSameMonth(day: Date): boolean {
  return (
    day.getMonth() === visibleMonth.value.getMonth() &&
    day.getFullYear() === visibleMonth.value.getFullYear()
  )
}

watch([visibleMonth, pendingOnly], () => {
  void loadTasks()
})

onMounted(() => {
  void loadOptions()
  void loadTasks()
})
</script>

<template>
  <PageView title="Agenda">
    <template #actions>
      <Button variant="secondary" icon="lucide:refresh-cw" @click="loadTasks">Atualizar</Button>
      <Button icon="lucide:plus" @click="openNew()">Nova tarefa</Button>
    </template>

    <div class="flex min-h-0 flex-1 flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="rounded-full border border-brand-ink/15 bg-white p-2 text-brand-ink/60 hover:bg-[#f4f6f8]"
            aria-label="Mês anterior"
            @click="prevMonth"
          >
            <Icon icon="lucide:chevron-left" class="size-5" />
          </button>
          <h2 class="min-w-[10rem] text-center text-lg font-semibold capitalize text-brand-ink">
            {{ monthLabel }}
          </h2>
          <button
            type="button"
            class="rounded-full border border-brand-ink/15 bg-white p-2 text-brand-ink/60 hover:bg-[#f4f6f8]"
            aria-label="Próximo mês"
            @click="nextMonth"
          >
            <Icon icon="lucide:chevron-right" class="size-5" />
          </button>
          <Button variant="ghost" size="sm" @click="goToday">Hoje</Button>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <span
            class="inline-flex items-center gap-1.5 rounded-full border border-brand-ink/10 bg-white px-3 py-1.5 text-xs font-medium text-brand-ink/55"
          >
            <Icon icon="lucide:check-square" class="size-3.5 text-brand-cyan-ink" />
            Tarefas do CRM
          </span>
          <label class="inline-flex items-center gap-2 text-sm text-brand-ink/65">
            <input
              v-model="pendingOnly"
              type="checkbox"
              class="size-4 rounded border-brand-ink/20"
            />
            Só pendentes
          </label>
        </div>
      </div>

      <p v-if="error" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {{ error }}
      </p>

      <div
        class="min-h-0 flex-1 overflow-auto rounded-2xl border border-brand-ink/10 bg-white"
      >
        <div class="grid grid-cols-7 border-b border-brand-ink/10 bg-[#f8fafb]">
          <div
            v-for="w in weekdays"
            :key="w"
            class="px-2 py-2 text-center text-[0.7rem] font-medium tracking-wider text-brand-ink/45 uppercase"
          >
            {{ w }}
          </div>
        </div>

        <div v-if="loading" class="py-16 text-center text-sm text-brand-ink/50">Carregando…</div>

        <div v-else class="grid grid-cols-7 auto-rows-[minmax(6.5rem,1fr)]">
          <button
            v-for="(day, idx) in cells"
            :key="idx"
            type="button"
            class="flex min-h-[6.5rem] flex-col gap-1 border-r border-b border-brand-ink/8 p-1.5 text-left transition hover:bg-[#f4f6f8]"
            :class="!isSameMonth(day) ? 'bg-[#fafbfc] opacity-50' : ''"
            @click="openNew(day)"
          >
            <span
              class="inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold"
              :class="
                ymd(day) === todayYmd
                  ? 'bg-brand-cyan text-brand-ink'
                  : 'text-brand-ink/70'
              "
            >
              {{ day.getDate() }}
            </span>

            <div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
              <button
                v-for="task in dayTasks(day).slice(0, 3)"
                :key="task.id"
                type="button"
                class="truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium"
                :class="
                  task.done_at
                    ? 'bg-brand-ink/5 text-brand-ink/40 line-through'
                    : 'bg-brand-blue/10 text-brand-ink'
                "
                @click.stop="openTask(task)"
              >
                {{ task.title }}
              </button>
              <span
                v-if="dayTasks(day).length > 3"
                class="px-1 text-[10px] font-medium text-brand-ink/45"
              >
                +{{ dayTasks(day).length - 3 }} mais
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>

    <TaskEventModal
      v-model:open="modalOpen"
      :task="editingTask"
      :default-due-at="defaultDueAt"
      :lead-options="leadOptions"
      :deal-options="dealOptions"
      @saved="loadTasks"
      @deleted="loadTasks"
    />
  </PageView>
</template>
