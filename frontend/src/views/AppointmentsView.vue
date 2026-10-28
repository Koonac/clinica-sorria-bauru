<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { toApiError } from '@/api/client'
import {
  cancelAppointment,
  listAppointments,
  setAppointmentOutcome,
  type Appointment,
  type AppointmentScheduleMeta,
  type AppointmentView,
} from '@/api/crm/appointments'
import Button from '@/components/Buttons/Button.vue'
import ContentSkeleton from '@/components/Feedback/ContentSkeleton.vue'
import PageView from '@/components/Layout/PageView.vue'
import ConfirmModal from '@/components/Modals/ConfirmModal.vue'
import ConfirmPreBookingModal from '@/components/Modals/ConfirmPreBookingModal.vue'
import { formatDateTime } from '@/utils/crmFormat'
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_TONE } from '@/utils/leadAttendance'

const TABS: { value: AppointmentView; label: string; icon: string }[] = [
  { value: 'pre_booking', label: 'Pré-agendamentos', icon: 'lucide:inbox' },
  { value: 'upcoming', label: 'Próximas', icon: 'lucide:calendar-clock' },
  { value: 'history', label: 'Histórico', icon: 'lucide:history' },
]

const route = useRoute()
const router = useRouter()

const tab = ref<AppointmentView>(
  TABS.some((t) => t.value === route.query.tab)
    ? (route.query.tab as AppointmentView)
    : 'pre_booking',
)
const items = ref<Appointment[]>([])
const total = ref(0)
const loading = ref(true)
const listError = ref('')
const flash = ref('')
const search = ref('')
const busyId = ref<number | null>(null)

const confirmOpen = ref(false)
const confirming = ref<Appointment | null>(null)
const cancelOpen = ref(false)
const cancelling = ref<Appointment | null>(null)

const cancelTitle = computed(() =>
  cancelling.value?.status === 'pre_agendado' ? 'Recusar pré-agendamento' : 'Cancelar consulta',
)

async function load() {
  loading.value = true
  listError.value = ''
  try {
    const page = await listAppointments({
      view: tab.value,
      search: search.value.trim() || undefined,
    })
    items.value = page.data
    total.value = page.total
  } catch (error) {
    listError.value = toApiError(error).message || 'Não foi possível carregar as consultas.'
  } finally {
    loading.value = false
  }
}

watch(tab, (value) => {
  void router.replace({ query: { ...route.query, tab: value } })
  void load()
})

function whenLabel(a: Appointment): string {
  return a.starts_at ? formatDateTime(a.starts_at) : a.preferred_text || 'Sem data'
}

function confirmationHint(a: Appointment): string | null {
  if (a.status === 'confirmado') return 'Paciente confirmou presença'
  if (a.status === 'agendado' && a.reminder_sent_at)
    return 'Lembrete enviado · aguardando confirmação'
  if (a.status === 'agendado') return 'Lembrete ainda não enviado'
  return null
}

function openConfirm(a: Appointment) {
  confirming.value = a
  confirmOpen.value = true
}

function onConfirmed(_a: Appointment, meta: AppointmentScheduleMeta) {
  const parts = ['Consulta agendada.']
  if (meta.calendar_error) parts.push(`Google Agenda: ${meta.calendar_error}`)
  if (meta.patient_notified) parts.push('Paciente avisado pelo WhatsApp.')
  else if (meta.notify_error) parts.push(`Não foi possível avisar o paciente: ${meta.notify_error}`)
  flash.value = parts.join(' ')
  void load()
}

function askCancel(a: Appointment) {
  cancelling.value = a
  cancelOpen.value = true
}

async function doCancel() {
  const target = cancelling.value
  if (!target || busyId.value) return
  busyId.value = target.id
  try {
    await cancelAppointment(target.id)
    flash.value =
      target.status === 'pre_agendado' ? 'Pré-agendamento recusado.' : 'Consulta cancelada.'
    cancelOpen.value = false
    await load()
  } catch (error) {
    flash.value = toApiError(error).message || 'Não foi possível cancelar.'
  } finally {
    busyId.value = null
  }
}

async function setOutcome(a: Appointment, outcome: 'confirmado' | 'realizado' | 'faltou') {
  if (busyId.value) return
  busyId.value = a.id
  try {
    await setAppointmentOutcome(a.id, outcome)
    flash.value =
      outcome === 'confirmado'
        ? 'Presença confirmada.'
        : outcome === 'realizado'
          ? 'Consulta marcada como realizada.'
          : 'Falta registrada.'
    await load()
  } catch (error) {
    flash.value = toApiError(error).message || 'Não foi possível atualizar.'
  } finally {
    busyId.value = null
  }
}

function isPast(a: Appointment): boolean {
  return Boolean(a.starts_at && new Date(a.starts_at).getTime() < Date.now())
}

onMounted(load)
</script>

<template>
  <PageView title="Consultas">
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <div class="inline-flex rounded-full border border-brand-ink/10 bg-white p-1" role="tablist">
        <button
          v-for="t in TABS"
          :key="t.value"
          type="button"
          role="tab"
          :aria-selected="tab === t.value"
          class="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition"
          :class="
            tab === t.value
              ? 'bg-brand-cyan/20 text-brand-cyan-ink'
              : 'text-brand-ink/60 hover:text-brand-ink'
          "
          @click="tab = t.value"
        >
          <Icon :icon="t.icon" class="size-4" aria-hidden="true" />
          {{ t.label }}
        </button>
      </div>
      <form class="ml-auto flex min-w-0 items-center gap-2" @submit.prevent="load">
        <label class="relative min-w-0">
          <span class="sr-only">Buscar paciente</span>
          <Icon
            icon="lucide:search"
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-brand-ink/40"
            aria-hidden="true"
          />
          <input
            v-model="search"
            type="search"
            placeholder="Paciente ou telefone"
            class="w-56 max-w-full rounded-full border border-brand-ink/15 bg-white py-2 pr-4 pl-9 text-sm text-brand-ink outline-none focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
          />
        </label>
      </form>
    </div>

    <p
      v-if="flash"
      class="shrink-0 rounded-xl border border-brand-cyan/35 bg-brand-cyan/10 px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
      role="status"
    >
      {{ flash }}
    </p>

    <p
      v-if="listError"
      class="rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm text-brand-ink"
      role="alert"
    >
      {{ listError }}
    </p>

    <ContentSkeleton v-else-if="loading && items.length === 0" variant="table" :rows="6" />

    <p v-else-if="!loading && items.length === 0" class="text-sm text-brand-ink/55">
      {{
        tab === 'pre_booking'
          ? 'Nenhum pré-agendamento aguardando a recepção.'
          : tab === 'upcoming'
            ? 'Nenhuma consulta marcada.'
            : 'Nada no histórico.'
      }}
    </p>

    <ul v-else class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-4">
      <li
        v-for="a in items"
        :key="a.id"
        class="flex flex-col gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4 sm:flex-row sm:items-center"
      >
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <strong class="truncate text-sm font-semibold text-brand-ink">{{
              a.lead?.name || 'Paciente'
            }}</strong>
            <span
              class="rounded-full px-2 py-0.5 text-[11px] font-medium"
              :class="APPOINTMENT_STATUS_TONE[a.status]"
            >
              {{ APPOINTMENT_STATUS_LABELS[a.status] }}
            </span>
            <span
              v-if="a.source === 'ai'"
              class="rounded-full bg-brand-cyan/10 px-2 py-0.5 text-[11px] font-medium text-brand-cyan-ink"
            >
              via IA
            </span>
          </div>
          <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-brand-ink/65">
            <span class="inline-flex items-center gap-1">
              <Icon icon="lucide:calendar" class="size-3.5" aria-hidden="true" />
              {{ whenLabel(a) }}
            </span>
            <span v-if="a.title || a.service" class="inline-flex items-center gap-1">
              <Icon icon="lucide:stethoscope" class="size-3.5" aria-hidden="true" />
              {{ a.title || a.service?.name }}
            </span>
            <span v-if="a.lead?.mobile" class="inline-flex items-center gap-1">
              <Icon icon="lucide:phone" class="size-3.5" aria-hidden="true" />
              {{ a.lead.mobile }}
            </span>
          </p>
          <p v-if="a.notes" class="mt-1 line-clamp-2 text-xs text-brand-ink/50">{{ a.notes }}</p>
          <p v-if="confirmationHint(a)" class="mt-1 text-xs font-medium text-brand-ink/55">
            {{ confirmationHint(a) }}
          </p>
          <p
            v-if="a.status === 'cancelado' && a.cancel_reason"
            class="mt-1 text-xs text-brand-ink/50"
          >
            Motivo: {{ a.cancel_reason }}
          </p>
        </div>

        <div class="flex shrink-0 flex-wrap items-center gap-1.5">
          <RouterLink
            v-if="a.lead_id"
            :to="{ name: 'whatsapp', query: { lead: a.lead_id } }"
            class="inline-flex size-9 items-center justify-center rounded-lg border border-brand-ink/10 text-brand-ink/60 transition hover:border-brand-ink/20 hover:text-brand-ink"
            title="Abrir conversa"
            aria-label="Abrir conversa no WhatsApp"
          >
            <Icon icon="lucide:message-circle" class="size-4" aria-hidden="true" />
          </RouterLink>
          <template v-if="a.status === 'pre_agendado'">
            <Button size="sm" icon="lucide:calendar-check" @click="openConfirm(a)"
              >Confirmar</Button
            >
            <Button size="sm" variant="secondary" :disabled="busyId === a.id" @click="askCancel(a)"
              >Recusar</Button
            >
          </template>
          <template v-else-if="a.status === 'agendado' || a.status === 'confirmado'">
            <Button
              v-if="a.status === 'agendado' && !isPast(a)"
              size="sm"
              variant="secondary"
              icon="lucide:check"
              :loading="busyId === a.id"
              @click="setOutcome(a, 'confirmado')"
            >
              Confirmada
            </Button>
            <template v-if="isPast(a)">
              <Button
                size="sm"
                variant="secondary"
                icon="lucide:user-check"
                :disabled="busyId === a.id"
                @click="setOutcome(a, 'realizado')"
              >
                Compareceu
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon="lucide:user-x"
                :disabled="busyId === a.id"
                @click="setOutcome(a, 'faltou')"
              >
                Faltou
              </Button>
            </template>
            <Button
              v-else
              size="sm"
              variant="ghost"
              :disabled="busyId === a.id"
              @click="askCancel(a)"
              >Cancelar</Button
            >
          </template>
          <a
            v-if="a.google_html_link"
            :href="a.google_html_link"
            target="_blank"
            rel="noopener"
            class="inline-flex size-9 items-center justify-center rounded-lg border border-brand-ink/10 text-brand-ink/60 transition hover:border-brand-ink/20 hover:text-brand-ink"
            title="Abrir no Google Agenda"
            aria-label="Abrir no Google Agenda"
          >
            <Icon icon="lucide:external-link" class="size-4" aria-hidden="true" />
          </a>
        </div>
      </li>
      <li v-if="total > items.length" class="px-1 text-xs text-brand-ink/45">
        Mostrando {{ items.length }} de {{ total }}.
      </li>
    </ul>

    <ConfirmPreBookingModal
      v-model:open="confirmOpen"
      :appointment="confirming"
      @confirmed="onConfirmed"
    />

    <ConfirmModal
      v-model:open="cancelOpen"
      :title="cancelTitle"
      message="O horário será liberado na agenda. O paciente não é avisado automaticamente."
      confirm-label="Confirmar"
      confirm-variant="danger"
      :busy="busyId !== null"
      @confirm="doCancel"
    />
  </PageView>
</template>
