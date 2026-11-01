<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import {
  getCalendarStatus,
  listCalendarEvents,
  type CalendarEvent,
  type CalendarStatus,
} from '@/api/crm/calendar'
import { getPipeline } from '@/api/crm/pipeline'
import { listTasks } from '@/api/crm/tasks'
import type { CrmTask } from '@/api/crm/types'
import GoogleEventModal from '@/components/Modals/GoogleEventModal.vue'
import TaskEventModal from '@/components/Modals/TaskEventModal.vue'
import Button from '@/components/Buttons/Button.vue'
import ContentSkeleton from '@/components/Feedback/ContentSkeleton.vue'
import PageView from '@/components/Layout/PageView.vue'
import { useClinicsStore } from '@/stores/clinics'
import { endOfMonth, monthGrid, startOfMonth, ymd } from '@/utils/crmFormat'

const clinics = useClinicsStore()
const visibleMonth = ref(startOfMonth(new Date()))
const tasks = ref<CrmTask[]>([])
const events = ref<CalendarEvent[]>([])
const calendarStatus = ref<CalendarStatus | null>(null)
const loading = ref(true)
const error = ref('')
const pendingOnly = ref(false)
const modalOpen = ref(false)
const googleModalOpen = ref(false)
const editingTask = ref<CrmTask | null>(null)
const editingEvent = ref<CalendarEvent | null>(null)
const defaultDueAt = ref<string | null>(null)
const defaultEventDay = ref<string | null>(null)
const leadOptions = ref<Array<{ id: number; label: string }>>([])
const dealOptions = ref<Array<{ id: number; label: string }>>([])

const isGoogle = computed(() => calendarStatus.value?.provedor === 'google')

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

function addDaysYmd(isoDate: string, days: number): string {
  const parts = isoDate.split('-').map((part) => Number(part))
  const year = parts[0] ?? 1970
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return ymd(date)
}

function eventCoversDay(event: CalendarEvent, dayIso: string): boolean {
  if (event.allDay) {
    const start = String(event.start || '').slice(0, 10)
    let endExclusive = String(event.end || '').slice(0, 10)
    if (!start) return false
    if (!endExclusive || endExclusive <= start) {
      endExclusive = addDaysYmd(start, 1)
    }
    return dayIso >= start && dayIso < endExclusive
  }

  const start = event.start ? new Date(event.start) : null
  if (!start || Number.isNaN(start.getTime())) return false
  const end = event.end ? new Date(event.end) : start
  const startDay = ymd(start)
  const endDay = Number.isNaN(end.getTime()) ? startDay : ymd(end)
  if (
    !Number.isNaN(end.getTime()) &&
    end.getHours() === 0 &&
    end.getMinutes() === 0 &&
    end.getSeconds() === 0 &&
    endDay > startDay
  ) {
    return dayIso >= startDay && dayIso < endDay
  }
  return dayIso >= startDay && dayIso <= endDay
}

const eventsByDay = computed(() => {
  const map = new Map<string, CalendarEvent[]>()
  for (const day of cells.value) {
    const key = ymd(day)
    map.set(
      key,
      events.value.filter((event) => eventCoversDay(event, key)),
    )
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
  const from = startOfMonth(visibleMonth.value)
  const to = endOfMonth(visibleMonth.value)
  tasks.value = await listTasks({
    due_from: ymd(from),
    due_to: ymd(to),
    pending: pendingOnly.value || undefined,
  })
}

async function loadGoogleEvents() {
  const grid = cells.value
  const first = grid[0]
  const last = grid[grid.length - 1]
  if (!first || !last) {
    events.value = []
    return
  }
  const timeMin = new Date(first.getFullYear(), first.getMonth(), first.getDate()).toISOString()
  const timeMax = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).toISOString()
  events.value = await listCalendarEvents({ timeMin, timeMax })
}

async function loadAgenda() {
  loading.value = true
  error.value = ''
  try {
    calendarStatus.value = await getCalendarStatus()
    if (calendarStatus.value.provedor === 'google') {
      events.value = []
      await loadGoogleEvents()
      tasks.value = []
    } else {
      events.value = []
      await loadTasks()
    }
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
  if (isGoogle.value) {
    editingEvent.value = null
    defaultEventDay.value = day ? ymd(day) : ymd(new Date())
    googleModalOpen.value = true
    return
  }
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

function openEvent(event: CalendarEvent) {
  editingEvent.value = event
  defaultEventDay.value = null
  googleModalOpen.value = true
}

function dayTasks(day: Date): CrmTask[] {
  return tasksByDay.value.get(ymd(day)) || []
}

function dayEvents(day: Date): CalendarEvent[] {
  return eventsByDay.value.get(ymd(day)) || []
}

function eventLabel(event: CalendarEvent): string {
  if (event.allDay) return event.summary
  if (!event.start) return event.summary
  const date = new Date(event.start)
  if (Number.isNaN(date.getTime())) return event.summary
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${time} ${event.summary}`
}

function isSameMonth(day: Date): boolean {
  return (
    day.getMonth() === visibleMonth.value.getMonth() &&
    day.getFullYear() === visibleMonth.value.getFullYear()
  )
}

watch([visibleMonth, pendingOnly, () => clinics.activeClinicId], () => {
  void loadAgenda()
})

onMounted(() => {
  void loadOptions()
  void loadAgenda()
})
</script>

<template>
  <PageView title="Agenda">
    <template #actions>
      <Button variant="secondary" icon="lucide:refresh-cw" @click="loadAgenda">Atualizar</Button>
      <Button :icon="isGoogle ? 'lucide:calendar-plus' : 'lucide:plus'" @click="openNew()">
        {{ isGoogle ? 'Novo evento' : 'Nova tarefa' }}
      </Button>
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
            <Icon
              :icon="isGoogle ? 'lucide:calendar-days' : 'lucide:check-square'"
              class="size-3.5 text-brand-cyan-ink"
            />
            {{ isGoogle ? 'Google Agenda' : 'Tarefas do CRM' }}
          </span>
          <label v-if="!isGoogle" class="inline-flex items-center gap-2 text-sm text-brand-ink/65">
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

      <ContentSkeleton v-if="loading" variant="calendar" />

      <div
        v-else
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

        <div class="grid grid-cols-7 auto-rows-[minmax(6.5rem,1fr)]">
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

            <div v-if="isGoogle" class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
              <button
                v-for="event in dayEvents(day).slice(0, 3)"
                :key="event.id"
                type="button"
                class="truncate rounded-md bg-brand-blue/10 px-1.5 py-0.5 text-left text-[11px] font-medium text-brand-ink"
                @click.stop="openEvent(event)"
              >
                {{ eventLabel(event) }}
              </button>
              <span
                v-if="dayEvents(day).length > 3"
                class="px-1 text-[10px] font-medium text-brand-ink/45"
              >
                +{{ dayEvents(day).length - 3 }} mais
              </span>
            </div>

            <div v-else class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
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
      @saved="loadAgenda"
      @deleted="loadAgenda"
    />
    <GoogleEventModal
      v-model:open="googleModalOpen"
      :event="editingEvent"
      :default-day="defaultEventDay"
      @saved="loadAgenda"
      @deleted="loadAgenda"
    />
  </PageView>
</template>
