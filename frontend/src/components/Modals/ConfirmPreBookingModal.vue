<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError, toApiError } from '@/api/client'
import {
  confirmPreBooking,
  listAvailableSlots,
  type Appointment,
  type AppointmentScheduleMeta,
  type AvailableSlot,
} from '@/api/crm/appointments'
import Button from '@/components/Buttons/Button.vue'
import { fromLocalInputValue, toLocalInputValue, ymd } from '@/utils/crmFormat'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  appointment: Appointment | null
}>()

const emit = defineEmits<{
  confirmed: [appointment: Appointment, meta: AppointmentScheduleMeta]
}>()

const inputClass =
  'w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25'

const form = reactive({
  title: '',
  startsAt: '',
  duration: 30,
  notes: '',
  notifyPatient: true,
})
const loading = ref(false)
const formError = ref('')
const fieldErrors = reactive({ starts_at: '', ends_at: '' })

const slotsDate = ref('')
const slots = ref<AvailableSlot[]>([])
const slotsLoading = ref(false)
const slotsError = ref('')

const canSubmit = computed(() => !loading.value && form.startsAt !== '' && form.duration >= 5)

function reset() {
  const a = props.appointment
  form.title = a?.title || a?.service?.name || 'Consulta'
  form.duration = a?.service?.duration_minutes || 30
  form.notes = a?.notes || ''
  form.notifyPatient = true
  form.startsAt = a?.preferred_start_at ? toLocalInputValue(a.preferred_start_at) : ''
  formError.value = ''
  fieldErrors.starts_at = ''
  fieldErrors.ends_at = ''
  slots.value = []
  slotsError.value = ''
  const base = a?.preferred_start_at ? new Date(a.preferred_start_at) : new Date()
  slotsDate.value = ymd(base)
}

async function loadSlots() {
  if (!slotsDate.value) return
  slotsLoading.value = true
  slotsError.value = ''
  try {
    slots.value = await listAvailableSlots({
      data: slotsDate.value,
      dias: 3,
      duracao_minutos: Math.min(180, Math.max(15, form.duration)),
    })
  } catch (error) {
    slots.value = []
    slotsError.value = toApiError(error).message || 'Não foi possível consultar a agenda.'
  } finally {
    slotsLoading.value = false
  }
}

function pickSlot(slot: AvailableSlot) {
  form.startsAt = toLocalInputValue(slot.inicio)
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
    void loadSlots()
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})

async function onSubmit() {
  const appointment = props.appointment
  if (!appointment || !canSubmit.value) return
  loading.value = true
  formError.value = ''
  fieldErrors.starts_at = ''
  fieldErrors.ends_at = ''

  const startsIso = fromLocalInputValue(form.startsAt)
  const endsIso = new Date(new Date(startsIso).getTime() + form.duration * 60_000).toISOString()

  try {
    const result = await confirmPreBooking(appointment.id, {
      title: form.title.trim() || null,
      starts_at: startsIso,
      ends_at: endsIso,
      notes: form.notes.trim() || null,
      notify_patient: form.notifyPatient,
    })
    emit('confirmed', result.data, result.meta)
    close()
  } catch (error) {
    if (error instanceof ApiError) {
      fieldErrors.starts_at = error.details?.starts_at?.[0] || ''
      fieldErrors.ends_at = error.details?.ends_at?.[0] || ''
      if (!fieldErrors.starts_at && !fieldErrors.ends_at) {
        formError.value = error.message || 'Não foi possível confirmar o agendamento.'
      }
    } else {
      formError.value = 'Servidor indisponível. Tente novamente.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && appointment"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      @click.self="close"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-prebooking-title"
        class="flex max-h-[min(92vh,860px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-brand-ink/10 bg-white shadow-2xl"
        @click.stop
      >
        <header
          class="flex shrink-0 items-start justify-between gap-3 border-b border-brand-ink/10 px-5 pt-5 pb-4"
        >
          <div class="min-w-0">
            <p
              class="mb-1 text-[0.65rem] font-medium tracking-[0.22em] text-brand-cyan-ink uppercase"
            >
              Pré-agendamento
            </p>
            <h2
              id="confirm-prebooking-title"
              class="truncate text-xl font-semibold tracking-tight text-brand-ink"
            >
              {{ appointment.lead?.name || 'Paciente' }}
            </h2>
            <p class="mt-1 text-sm text-brand-ink/60">
              Preferência:
              <strong class="font-medium text-brand-ink">{{ appointment.preferred_text }}</strong>
            </p>
          </div>
          <button
            type="button"
            class="inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-brand-ink/55 transition hover:bg-[#f4f6f8] hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            aria-label="Fechar"
            @click="close"
          >
            <Icon icon="lucide:x" class="size-[18px]" aria-hidden="true" />
          </button>
        </header>

        <form
          class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5"
          @submit.prevent="onSubmit"
        >
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Título</span>
            <input v-model="form.title" type="text" maxlength="190" :class="inputClass" />
          </label>

          <div class="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-brand-ink/80">Data e hora</span>
              <input v-model="form.startsAt" type="datetime-local" required :class="inputClass" />
              <span v-if="fieldErrors.starts_at" class="text-sm text-brand-ink/70" role="alert">
                {{ fieldErrors.starts_at }}
              </span>
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-brand-ink/80">Duração (min)</span>
              <input
                v-model.number="form.duration"
                type="number"
                min="5"
                max="480"
                step="5"
                :class="inputClass"
              />
            </label>
          </div>

          <section class="rounded-xl border border-brand-ink/10 bg-[#f8fafb] p-3.5">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium text-brand-ink/80">Horários livres a partir de</span>
              <input
                v-model="slotsDate"
                type="date"
                class="rounded-lg border border-brand-ink/15 bg-white px-2.5 py-1.5 text-sm text-brand-ink outline-none focus:border-brand-cyan"
                @change="loadSlots"
              />
              <Button
                size="sm"
                variant="ghost"
                icon="lucide:refresh-cw"
                :loading="slotsLoading"
                @click="loadSlots"
              >
                Buscar
              </Button>
            </div>
            <p v-if="slotsError" class="mt-2 text-xs text-brand-ink/55">{{ slotsError }}</p>
            <p
              v-else-if="!slotsLoading && slots.length === 0"
              class="mt-2 text-xs text-brand-ink/55"
            >
              Nenhum horário livre encontrado nesses dias.
            </p>
            <div v-else class="mt-2.5 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              <button
                v-for="slot in slots"
                :key="slot.inicio"
                type="button"
                class="cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition"
                :class="
                  form.startsAt === toLocalInputValue(slot.inicio)
                    ? 'border-brand-cyan bg-brand-cyan/20 text-brand-cyan-ink'
                    : 'border-brand-ink/15 bg-white text-brand-ink/70 hover:border-brand-cyan'
                "
                @click="pickSlot(slot)"
              >
                {{ slot.rotulo }}
              </button>
            </div>
          </section>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Observações</span>
            <textarea
              v-model="form.notes"
              rows="3"
              maxlength="2000"
              :class="[inputClass, 'resize-y']"
            />
          </label>

          <label class="flex cursor-pointer items-center gap-2.5 text-sm text-brand-ink/80">
            <input
              v-model="form.notifyPatient"
              type="checkbox"
              class="size-4 rounded accent-brand-cyan"
            />
            Avisar o paciente pelo WhatsApp
          </label>

          <p
            v-if="formError"
            class="rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm text-brand-ink"
            role="alert"
          >
            {{ formError }}
          </p>

          <div class="mt-auto flex flex-wrap gap-2 pt-1">
            <Button
              type="submit"
              icon="lucide:calendar-check"
              :loading="loading"
              :disabled="!canSubmit"
            >
              Confirmar agendamento
            </Button>
            <Button type="button" variant="secondary" :disabled="loading" @click="close"
              >Cancelar</Button
            >
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
