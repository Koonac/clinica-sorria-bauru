<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { toApiError } from '@/api/client'
import { getClinic, updateClinic, type BusinessHours } from '@/api/clinics'
import Button from '@/components/Buttons/Button.vue'
import Skeleton from '@/components/Feedback/Skeleton.vue'
import WeeklyHoursEditor from '@/components/Forms/WeeklyHoursEditor.vue'
import { useClinicsStore } from '@/stores/clinics'
import { WEEK_DAYS, isValidWeek, type WeekDayKey } from '@/utils/weeklyHours'

const clinics = useClinicsStore()

const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const flash = ref('')
const dayErrors = ref<Partial<Record<WeekDayKey, string>>>({})

const hours = ref<BusinessHours>({})
const slotMinutes = ref(60)

const slotInputClass =
  'w-full rounded-xl border border-brand-ink/15 bg-white px-3 py-2 text-sm text-brand-ink tabular-nums outline-none transition focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25'

const canSave = computed(() => !saving.value && isValidWeek(hours.value) && slotMinutes.value >= 5)

async function load() {
  const clinicId = clinics.activeClinicId
  if (!clinicId) return
  loading.value = true
  errorMessage.value = ''
  flash.value = ''
  try {
    const clinic = await getClinic(clinicId)
    hours.value = clinic.business_hours ?? {}
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
  dayErrors.value = {}

  try {
    await updateClinic(clinicId, {
      business_hours: hours.value,
      google_calendar_slot_minutes: Number(slotMinutes.value),
    })
    flash.value = 'Horário de atendimento salvo. A IA já passa a oferecer só esses horários.'
  } catch (error) {
    const apiError = toApiError(error)
    for (const day of WEEK_DAYS) {
      const message = apiError.details?.[`business_hours.${day.key}.end`]?.[0]
      if (message) dayErrors.value[day.key] = message
    }
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
      <WeeklyHoursEditor
        v-model="hours"
        :day-errors="dayErrors"
        empty-message="Nenhum dia marcado: a IA não vai oferecer horários para agendamento."
      />

      <label class="flex max-w-xs flex-col gap-1.5">
        <span class="text-sm font-medium text-brand-ink/80">Duração de cada atendimento (min)</span>
        <input
          v-model.number="slotMinutes"
          type="number"
          min="5"
          max="240"
          step="5"
          :class="slotInputClass"
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
