<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
  type CalendarEvent,
} from '@/api/crm/calendar'
import Button from '@/components/Buttons/Button.vue'
import { inputClass, labelClass, toLocalInputValue, ymd } from '@/utils/crmFormat'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  event: CalendarEvent | null
  defaultDay?: string | null
}>()

const emit = defineEmits<{
  saved: []
  deleted: []
}>()

const loading = ref(false)
const formError = ref('')
const form = reactive({
  summary: '',
  description: '',
  location: '',
  allDay: false,
  start: '',
  end: '',
})

const isEdit = computed(() => Boolean(props.event))
const title = computed(() => (isEdit.value ? 'Editar evento' : 'Novo evento'))

function addDays(isoDate: string, days: number): string {
  const parts = isoDate.split('-').map((part) => Number(part))
  const year = parts[0] ?? 1970
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return ymd(date)
}

function reset() {
  const ev = props.event
  formError.value = ''
  loading.value = false
  form.summary = ev && ev.summary !== '(Sem título)' ? ev.summary : ''
  form.description = ev?.description ?? ''
  form.location = ev?.location ?? ''
  form.allDay = Boolean(ev?.allDay)

  if (ev?.allDay) {
    const start = String(ev.start || '').slice(0, 10)
    let end = String(ev.end || '').slice(0, 10)
    if (end && start && end > start) {
      end = addDays(end, -1)
    } else {
      end = start
    }
    form.start = start
    form.end = end
    return
  }

  if (ev?.start) {
    form.start = toLocalInputValue(ev.start)
    form.end = toLocalInputValue(ev.end || ev.start)
    return
  }

  const day = props.defaultDay || ymd(new Date())
  form.allDay = false
  form.start = `${day}T09:00`
  form.end = `${day}T10:00`
}

function onAllDayChange() {
  if (form.allDay) {
    form.start = String(form.start || '').slice(0, 10)
    form.end = String(form.end || form.start).slice(0, 10)
    return
  }
  const start = String(form.start || '')
  const end = String(form.end || '')
  form.start = start.length === 10 ? `${start}T09:00` : start.slice(0, 16)
  form.end = end.length === 10 ? `${end}T10:00` : end.slice(0, 16)
}

function close() {
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    close()
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    reset()
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => document.removeEventListener('keydown', onKeydown))

function payload() {
  if (form.allDay) {
    const start = form.start.slice(0, 10)
    const endInclusive = form.end.slice(0, 10) || start
    return {
      summary: form.summary.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      all_day: true,
      start,
      end: addDays(endInclusive, 1),
    }
  }

  return {
    summary: form.summary.trim(),
    description: form.description.trim() || null,
    location: form.location.trim() || null,
    all_day: false,
    start: new Date(form.start).toISOString(),
    end: new Date(form.end).toISOString(),
  }
}

async function submit() {
  if (!form.summary.trim() || !form.start || !form.end || loading.value) return
  loading.value = true
  formError.value = ''
  try {
    const body = payload()
    if (props.event) {
      await updateCalendarEvent(props.event.id, body)
    } else {
      await createCalendarEvent(body)
    }
    emit('saved')
    close()
  } catch (error) {
    formError.value =
      error instanceof ApiError ? error.message : 'Não foi possível salvar o evento.'
  } finally {
    loading.value = false
  }
}

async function remove() {
  if (!props.event || !confirm('Excluir este evento? Esta ação não pode ser desfeita.')) return
  loading.value = true
  try {
    await deleteCalendarEvent(props.event.id)
    emit('deleted')
    close()
  } catch (error) {
    formError.value =
      error instanceof ApiError ? error.message : 'Não foi possível excluir o evento.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      v-backdrop-close="close"
    >
      <div
        role="dialog"
        aria-modal="true"
        class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-[0.7rem] font-medium tracking-[0.2em] text-brand-cyan-ink uppercase">
              Google Agenda
            </p>
            <h2 class="mt-1 text-xl font-semibold text-brand-ink">{{ title }}</h2>
          </div>
          <button
            type="button"
            class="rounded-full p-2 text-brand-ink/45 hover:bg-[#f4f6f8]"
            aria-label="Fechar"
            @click="close"
          >
            <Icon icon="lucide:x" class="size-5" />
          </button>
        </div>

        <form class="mt-5 space-y-3" @submit.prevent="submit">
          <div>
            <label :class="labelClass" for="gcal-title">Título</label>
            <input id="gcal-title" v-model="form.summary" required :class="inputClass" />
          </div>

          <label class="inline-flex items-center gap-2 text-sm text-brand-ink">
            <input
              v-model="form.allDay"
              type="checkbox"
              class="size-4 rounded border-brand-ink/20"
              @change="onAllDayChange"
            />
            Dia inteiro
          </label>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label :class="labelClass" for="gcal-start">Início</label>
              <input
                id="gcal-start"
                v-model="form.start"
                :type="form.allDay ? 'date' : 'datetime-local'"
                required
                :class="inputClass"
              />
            </div>
            <div>
              <label :class="labelClass" for="gcal-end">Fim</label>
              <input
                id="gcal-end"
                v-model="form.end"
                :type="form.allDay ? 'date' : 'datetime-local'"
                required
                :class="inputClass"
              />
            </div>
          </div>

          <div>
            <label :class="labelClass" for="gcal-loc">Local</label>
            <input id="gcal-loc" v-model="form.location" :class="inputClass" />
          </div>
          <div>
            <label :class="labelClass" for="gcal-desc">Descrição</label>
            <textarea id="gcal-desc" v-model="form.description" rows="3" :class="inputClass" />
          </div>

          <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>

          <div class="flex flex-wrap items-center justify-between gap-2 pt-2">
            <Button
              v-if="isEdit"
              variant="danger"
              type="button"
              :loading="loading"
              @click="remove"
            >
              Excluir
            </Button>
            <div v-else />
            <div class="flex gap-2">
              <Button variant="secondary" type="button" @click="close">Cancelar</Button>
              <Button type="submit" :loading="loading">{{ isEdit ? 'Salvar' : 'Criar evento' }}</Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
