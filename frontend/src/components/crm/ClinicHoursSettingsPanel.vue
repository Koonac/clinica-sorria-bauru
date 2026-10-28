<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { toApiError } from '@/api/client'
import { getClinic, updateClinic, type BusinessHours } from '@/api/clinics'
import Button from '@/components/Buttons/Button.vue'
import Skeleton from '@/components/Feedback/Skeleton.vue'
import { useClinicsStore } from '@/stores/clinics'

type DayKey = '1' | '2' | '3' | '4' | '5' | '6' | '7'

const DAYS: { key: DayKey; short: string; long: string }[] = [
  { key: '1', short: 'Seg', long: 'Segunda' },
  { key: '2', short: 'Ter', long: 'Terça' },
  { key: '3', short: 'Qua', long: 'Quarta' },
  { key: '4', short: 'Qui', long: 'Quinta' },
  { key: '5', short: 'Sex', long: 'Sexta' },
  { key: '6', short: 'Sáb', long: 'Sábado' },
  { key: '7', short: 'Dom', long: 'Domingo' },
]

const DEFAULT_RANGE = { start: '08:00', end: '18:00' }

const clinics = useClinicsStore()

const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const flash = ref('')
const fieldErrors = ref<Record<string, string>>({})

/** Horário de cada dia (mantido mesmo quando o dia é desmarcado, para não perder o que foi digitado). */
const ranges = reactive<Record<DayKey, { start: string; end: string }>>(
  Object.fromEntries(DAYS.map((d) => [d.key, { ...DEFAULT_RANGE }])) as Record<
    DayKey,
    { start: string; end: string }
  >,
)
const openDays = ref<DayKey[]>([])
const slotMinutes = ref(60)

const sortedOpenDays = computed(() => DAYS.filter((d) => openDays.value.includes(d.key)))

const timeInputClass =
  'w-full rounded-xl border border-brand-ink/15 bg-white px-3 py-2 text-sm text-brand-ink tabular-nums outline-none transition focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25'

function invalidRange(key: DayKey): boolean {
  const range = ranges[key]
  return !range.start || !range.end || range.end <= range.start
}

const canSave = computed(
  () =>
    !saving.value &&
    sortedOpenDays.value.every((d) => !invalidRange(d.key)) &&
    slotMinutes.value >= 5,
)

function toggleDay(key: DayKey) {
  openDays.value = openDays.value.includes(key)
    ? openDays.value.filter((d) => d !== key)
    : [...openDays.value, key]
}

/** Copia o horário do primeiro dia aberto para todos os outros dias abertos. */
function copyFirstToAll() {
  const first = sortedOpenDays.value[0]
  if (!first) return
  const source = { ...ranges[first.key] }
  for (const day of sortedOpenDays.value) ranges[day.key] = { ...source }
}

async function load() {
  const clinicId = clinics.activeClinicId
  if (!clinicId) return
  loading.value = true
  errorMessage.value = ''
  flash.value = ''
  try {
    const clinic = await getClinic(clinicId)
    const hours = clinic.business_hours ?? {}
    openDays.value = DAYS.filter((d) => hours[d.key]).map((d) => d.key)
    for (const day of DAYS) {
      const range = hours[day.key]
      ranges[day.key] = range ? { start: range.start, end: range.end } : { ...DEFAULT_RANGE }
    }
    slotMinutes.value = clinic.appointment_slot_minutes ?? 60
  } catch (error) {
    errorMessage.value =
      toApiError(error).message || 'Não foi possível carregar o horário de atendimento.'
  } finally {
    loading.value = false
  }
}

async function save() {
  const clinicId = clinics.activeClinicId
  if (!clinicId || !canSave.value) return
  saving.value = true
  errorMessage.value = ''
  flash.value = ''
  fieldErrors.value = {}

  const businessHours: BusinessHours = {}
  for (const day of sortedOpenDays.value) businessHours[day.key] = { ...ranges[day.key] }

  try {
    await updateClinic(clinicId, {
      business_hours: businessHours,
      google_calendar_slot_minutes: Number(slotMinutes.value),
    })
    flash.value = 'Horário de atendimento salvo. A IA já passa a oferecer só esses horários.'
  } catch (error) {
    const apiError = toApiError(error)
    fieldErrors.value = Object.fromEntries(
      Object.entries(apiError.details ?? {}).map(([key, messages]) => [key, messages[0] ?? '']),
    )
    errorMessage.value = apiError.message || 'Não foi possível salvar o horário de atendimento.'
  } finally {
    saving.value = false
  }
}

watch(
  () => clinics.activeClinicId,
  () => void load(),
)

onMounted(load)
</script>

<template>
  <div class="flex w-full flex-col gap-5">
    <div>
      <h3 class="text-lg font-semibold text-brand-ink">Horário de atendimento</h3>
      <p class="mt-1 text-sm leading-relaxed text-brand-ink/65">
        Dias e horários em que a clínica atende. A IA só oferece horários dentro deles, e a agenda
        sugere horários livres com base nisso.
      </p>
    </div>

    <p
      v-if="flash"
      class="rounded-xl border border-brand-cyan/35 bg-brand-cyan/10 px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
      role="status"
    >
      {{ flash }}
    </p>
    <p
      v-if="errorMessage"
      class="rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <div v-if="loading" class="flex flex-col gap-3" aria-busy="true">
      <div class="flex flex-wrap gap-2">
        <Skeleton v-for="n in 7" :key="n" class="h-9 w-14 rounded-full" />
      </div>
      <Skeleton class="h-12 w-full rounded-xl" />
      <Skeleton class="h-12 w-full rounded-xl" />
    </div>

    <form v-else class="flex flex-col gap-5" @submit.prevent="save">
      <fieldset>
        <legend class="mb-2 text-sm font-medium text-brand-ink/80">Dias de funcionamento</legend>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="day in DAYS"
            :key="day.key"
            type="button"
            class="inline-flex h-9 min-w-14 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            :class="
              openDays.includes(day.key)
                ? 'border-brand-cyan bg-brand-cyan text-brand-ink'
                : 'border-brand-ink/15 bg-white text-brand-ink/55 hover:border-brand-ink/30 hover:text-brand-ink'
            "
            :aria-pressed="openDays.includes(day.key)"
            :title="day.long"
            @click="toggleDay(day.key)"
          >
            <Icon
              v-if="openDays.includes(day.key)"
              icon="lucide:check"
              class="size-3.5"
              aria-hidden="true"
            />
            {{ day.short }}
          </button>
        </div>
      </fieldset>

      <div v-if="sortedOpenDays.length" class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium text-brand-ink/80">Horário de cada dia</span>
          <button
            v-if="sortedOpenDays.length > 1"
            type="button"
            class="inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-brand-cyan-ink transition hover:bg-brand-cyan/10"
            @click="copyFirstToAll"
          >
            <Icon icon="lucide:copy" class="size-3.5" aria-hidden="true" />
            Usar o horário de {{ sortedOpenDays[0]?.long.toLowerCase() }} em todos
          </button>
        </div>

        <ul class="flex flex-col gap-2">
          <li
            v-for="day in sortedOpenDays"
            :key="day.key"
            class="grid grid-cols-[5.5rem_1fr_auto_1fr] items-center gap-2 rounded-xl border border-brand-ink/10 bg-[#f8fafb] px-3 py-2"
          >
            <span class="text-sm font-medium text-brand-ink">{{ day.long }}</span>
            <input
              v-model="ranges[day.key].start"
              type="time"
              step="900"
              required
              :class="timeInputClass"
              :aria-label="`${day.long}: abre às`"
            />
            <span class="text-xs text-brand-ink/45">até</span>
            <input
              v-model="ranges[day.key].end"
              type="time"
              step="900"
              required
              :class="[
                timeInputClass,
                invalidRange(day.key) ? 'border-red-300 focus:border-red-400' : '',
              ]"
              :aria-label="`${day.long}: fecha às`"
            />
            <p
              v-if="invalidRange(day.key) || fieldErrors[`business_hours.${day.key}.end`]"
              class="col-span-4 text-xs text-red-700"
              role="alert"
            >
              {{
                fieldErrors[`business_hours.${day.key}.end`] ||
                'O fechamento deve ser depois da abertura.'
              }}
            </p>
          </li>
        </ul>
      </div>
      <p
        v-else
        class="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-900"
      >
        Nenhum dia marcado: a IA não vai oferecer horários para agendamento.
      </p>

      <label class="flex max-w-xs flex-col gap-1.5">
        <span class="text-sm font-medium text-brand-ink/80">Duração de cada atendimento (min)</span>
        <input
          v-model.number="slotMinutes"
          type="number"
          min="5"
          max="240"
          step="5"
          :class="timeInputClass"
        />
        <span class="text-xs text-brand-ink/45">
          Intervalo entre os horários oferecidos (ex.: 60 = 08:00, 09:00, 10:00…).
        </span>
      </label>

      <div>
        <Button type="submit" icon="lucide:save" :loading="saving" :disabled="!canSave">
          Salvar horário
        </Button>
      </div>
    </form>
  </div>
</template>
