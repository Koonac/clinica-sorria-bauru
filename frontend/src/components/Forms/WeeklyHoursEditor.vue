<script setup lang="ts">
import { computed, reactive } from 'vue'
import { Icon } from '@iconify/vue'
import type { BusinessHours } from '@/api/clinics'
import { WEEK_DAYS, isValidRange, type WeekDayKey } from '@/utils/weeklyHours'

const hours = defineModel<BusinessHours>({ required: true })

const props = withDefaults(
  defineProps<{
    legend?: string
    /** Permite fim antes do início (período que vira a madrugada). */
    allowOvernight?: boolean
    /** Mensagem exibida quando nenhum dia está marcado. */
    emptyMessage?: string
    dayErrors?: Partial<Record<WeekDayKey, string>>
  }>(),
  {
    legend: 'Dias de funcionamento',
    allowOvernight: false,
    emptyMessage: '',
    dayErrors: () => ({}),
  },
)

const DEFAULT_RANGE = { start: '08:00', end: '18:00' }

/** Guarda o horário de dias desmarcados, para não perder o que foi digitado. */
const remembered = reactive<Partial<Record<WeekDayKey, { start: string; end: string }>>>({})

const openDays = computed(() => WEEK_DAYS.filter((d) => hours.value[d.key]))

const timeInputClass =
  'w-full rounded-xl border border-brand-ink/15 bg-white px-3 py-2 text-sm text-brand-ink tabular-nums outline-none transition focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25'

function toggleDay(key: WeekDayKey) {
  const next = { ...hours.value }
  const current = next[key]
  if (current) {
    remembered[key] = current
    delete next[key]
  } else {
    next[key] = { ...(remembered[key] ?? DEFAULT_RANGE) }
  }
  hours.value = next
}

function setTime(key: WeekDayKey, field: 'start' | 'end', event: Event) {
  const current = hours.value[key]
  if (!current) return
  const value = (event.target as HTMLInputElement).value
  hours.value = { ...hours.value, [key]: { ...current, [field]: value } }
}

/** Copia o horário do primeiro dia aberto para todos os outros dias abertos. */
function copyFirstToAll() {
  const first = openDays.value[0]
  const source = first && hours.value[first.key]
  if (!source) return
  const next = { ...hours.value }
  for (const day of openDays.value) next[day.key] = { ...source }
  hours.value = next
}

function dayError(key: WeekDayKey): string {
  if (props.dayErrors[key]) return props.dayErrors[key] ?? ''
  const range = hours.value[key]
  if (!range || isValidRange(range, props.allowOvernight)) return ''
  return props.allowOvernight
    ? 'O início e o fim devem ser diferentes.'
    : 'O fechamento deve ser depois da abertura.'
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <fieldset>
      <legend class="mb-2 text-sm font-medium text-brand-ink/80">{{ legend }}</legend>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="day in WEEK_DAYS"
          :key="day.key"
          type="button"
          class="inline-flex h-9 min-w-14 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
          :class="
            hours[day.key]
              ? 'border-brand-cyan bg-brand-cyan text-brand-ink'
              : 'border-brand-ink/15 bg-white text-brand-ink/55 hover:border-brand-ink/30 hover:text-brand-ink'
          "
          :aria-pressed="Boolean(hours[day.key])"
          :title="day.long"
          @click="toggleDay(day.key)"
        >
          <Icon v-if="hours[day.key]" icon="lucide:check" class="size-3.5" aria-hidden="true" />
          {{ day.short }}
        </button>
      </div>
    </fieldset>

    <div v-if="openDays.length" class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm font-medium text-brand-ink/80">Horário de cada dia</span>
        <button
          v-if="openDays.length > 1"
          type="button"
          class="inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-brand-cyan-ink transition hover:bg-brand-cyan/10"
          @click="copyFirstToAll"
        >
          <Icon icon="lucide:copy" class="size-3.5" aria-hidden="true" />
          Usar o horário de {{ openDays[0]?.long.toLowerCase() }} em todos
        </button>
      </div>

      <ul class="flex flex-col gap-2">
        <li
          v-for="day in openDays"
          :key="day.key"
          class="grid grid-cols-[5.5rem_1fr_auto_1fr] items-center gap-2 rounded-xl border border-brand-ink/10 bg-[#f8fafb] px-3 py-2"
        >
          <span class="text-sm font-medium text-brand-ink">{{ day.long }}</span>
          <input
            :value="hours[day.key]?.start"
            type="time"
            step="900"
            required
            :class="timeInputClass"
            :aria-label="`${day.long}: início`"
            @input="setTime(day.key, 'start', $event)"
          />
          <span class="text-xs text-brand-ink/45">até</span>
          <input
            :value="hours[day.key]?.end"
            type="time"
            step="900"
            required
            :class="[
              timeInputClass,
              dayError(day.key) ? 'border-red-300 focus:border-red-400' : '',
            ]"
            :aria-label="`${day.long}: fim`"
            @input="setTime(day.key, 'end', $event)"
          />
          <p v-if="dayError(day.key)" class="col-span-4 text-xs text-red-700" role="alert">
            {{ dayError(day.key) }}
          </p>
        </li>
      </ul>
    </div>
    <p
      v-else-if="emptyMessage"
      class="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-900"
    >
      {{ emptyMessage }}
    </p>
  </div>
</template>
