<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import {
  createAgent,
  getAgent,
  updateAgent,
  type Agent,
} from '@/api/crm/agents'
import type { BusinessHours } from '@/api/clinics'
import Button from '@/components/Buttons/Button.vue'
import ContentSkeleton from '@/components/Feedback/ContentSkeleton.vue'
import WeeklyHoursEditor from '@/components/Forms/WeeklyHoursEditor.vue'
import AgentToolsReference from '@/components/crm/AgentToolsReference.vue'
import PageView from '@/components/Layout/PageView.vue'
import { WEEK_DAYS, isValidWeek, type WeekDayKey } from '@/utils/weeklyHours'

const route = useRoute()
const router = useRouter()

const inputClass =
  'w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25'

const agentId = computed(() => {
  const raw = route.params.id
  if (raw == null || Array.isArray(raw)) return null
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
})

const isEdit = computed(() => route.name === 'agents-edit')

const pageTitle = computed(() => (isEdit.value ? 'Editar agent' : 'Novo agent'))

const WORKDAY = { start: '08:00', end: '18:00' }
const WEEKDAYS_DEFAULT: BusinessHours = {
  '1': WORKDAY,
  '2': WORKDAY,
  '3': WORKDAY,
  '4': WORKDAY,
  '5': WORKDAY,
}

const form = reactive({
  name: '',
  system_prompt: '',
  debounce_seconds: 10,
  is_active: false,
  limit_hours: false,
  working_hours: { ...WEEKDAYS_DEFAULT } as BusinessHours,
})

const fieldErrors = reactive({
  name: '',
  system_prompt: '',
  debounce_seconds: '',
  is_active: '',
  working_hours: '',
})
const workingDayErrors = ref<Partial<Record<WeekDayKey, string>>>({})

const loading = ref(false)
const pageLoading = ref(isEdit.value)
const pageError = ref('')
const formError = ref('')
const agent = ref<Agent | null>(null)

const canSubmit = computed(() => {
  if (loading.value || pageLoading.value) return false
  if (!form.name.trim()) return false
  if (form.is_active && !form.system_prompt.trim()) return false
  const debounce = Number(form.debounce_seconds)
  if (!Number.isFinite(debounce) || debounce < 3 || debounce > 60) return false
  if (form.limit_hours) {
    if (Object.keys(form.working_hours).length === 0) return false
    if (!isValidWeek(form.working_hours, true)) return false
  }
  return true
})

function clearFieldErrors() {
  fieldErrors.name = ''
  fieldErrors.system_prompt = ''
  fieldErrors.debounce_seconds = ''
  fieldErrors.is_active = ''
  fieldErrors.working_hours = ''
  workingDayErrors.value = {}
}

function fillForm(source: Agent | null) {
  form.name = source?.name ?? ''
  form.system_prompt = source?.system_prompt ?? ''
  form.debounce_seconds = source?.debounce_seconds ?? 10
  form.is_active = source?.is_active ?? false
  form.limit_hours = Boolean(source?.working_hours)
  form.working_hours = source?.working_hours ?? { ...WEEKDAYS_DEFAULT }
  clearFieldErrors()
  formError.value = ''
}

function applyApiFieldErrors(details?: Record<string, string[]>) {
  if (!details) return
  fieldErrors.name = details.name?.[0] || ''
  fieldErrors.system_prompt = details.system_prompt?.[0] || ''
  fieldErrors.debounce_seconds = details.debounce_seconds?.[0] || ''
  fieldErrors.is_active = details.is_active?.[0] || ''
  fieldErrors.working_hours = details.working_hours?.[0] || ''
  for (const day of WEEK_DAYS) {
    const message = details[`working_hours.${day.key}.end`]?.[0]
    if (message) workingDayErrors.value[day.key] = message
  }
}

function goBack() {
  void router.push({ name: 'agents' })
}

async function loadAgent() {
  const id = agentId.value
  if (!isEdit.value || id == null) {
    agent.value = null
    fillForm(null)
    pageLoading.value = false
    pageError.value = ''
    return
  }

  pageLoading.value = true
  pageError.value = ''

  try {
    agent.value = await getAgent(id)
    fillForm(agent.value)
  } catch (error) {
    agent.value = null
    if (error instanceof ApiError) {
      pageError.value = error.message || 'Não foi possível carregar o agent.'
    } else {
      pageError.value = 'Servidor indisponível. Tente novamente.'
    }
  } finally {
    pageLoading.value = false
  }
}

async function onSubmit() {
  if (!canSubmit.value) return

  clearFieldErrors()
  formError.value = ''

  if (form.is_active && !form.system_prompt.trim()) {
    fieldErrors.system_prompt = 'Defina o system prompt para ativar o agent.'
    return
  }

  loading.value = true

  try {
    const payload = {
      name: form.name.trim(),
      system_prompt: form.system_prompt.trim() || null,
      debounce_seconds: Number(form.debounce_seconds),
      is_active: form.is_active,
      working_hours: form.limit_hours ? form.working_hours : null,
    }

    const saved =
      isEdit.value && agent.value
        ? await updateAgent(agent.value.id, payload)
        : await createAgent(payload)

    await router.push({
      name: 'agents',
      query: { flash: isEdit.value ? 'updated' : 'created', name: saved.name },
    })
  } catch (error) {
    if (error instanceof ApiError) {
      applyApiFieldErrors(error.details)
      const hasFieldError =
        Object.values(fieldErrors).some(Boolean) ||
        Object.keys(workingDayErrors.value).length > 0
      if (!hasFieldError) {
        formError.value =
          error.message ||
          (isEdit.value ? 'Não foi possível salvar o agent.' : 'Não foi possível criar o agent.')
      }
    } else {
      formError.value = 'Servidor indisponível. Tente novamente.'
    }
  } finally {
    loading.value = false
  }
}

watch(
  () => [route.name, route.params.id] as const,
  () => {
    void loadAgent()
  },
)

onMounted(() => {
  void loadAgent()
})
</script>

<template>
  <PageView :title="pageTitle">
    <template #actions>
      <Button variant="secondary" icon="lucide:arrow-left" @click="goBack">Voltar</Button>
    </template>

    <ContentSkeleton v-if="pageLoading" variant="detail" />

    <div
      v-else-if="pageError"
      class="flex flex-col gap-4 rounded-2xl border border-brand-ink/10 bg-white p-5"
    >
      <p class="text-sm text-brand-ink" role="alert">{{ pageError }}</p>
      <div>
        <Button variant="secondary" icon="lucide:arrow-left" @click="goBack">Voltar</Button>
      </div>
    </div>

    <form
      v-else
      class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto rounded-2xl border border-brand-ink/10 bg-white p-5 md:p-6"
      @submit.prevent="onSubmit"
    >
      <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        <div class="flex min-w-0 flex-col gap-5">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Nome</span>
            <input
              v-model="form.name"
              type="text"
              name="name"
              required
              maxlength="255"
              :class="inputClass"
            />
            <span v-if="fieldErrors.name" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.name }}
            </span>
          </label>

          <label class="flex min-h-0 flex-1 flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">System prompt</span>
            <textarea
              v-model="form.system_prompt"
              name="system_prompt"
              rows="18"
              :required="form.is_active"
              placeholder="Instruções do agent para atendimento no WhatsApp"
              :class="[inputClass, 'min-h-80 flex-1 resize-y']"
            />
            <span v-if="fieldErrors.system_prompt" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.system_prompt }}
            </span>
          </label>

          <AgentToolsReference />
        </div>

        <aside class="flex flex-col gap-5">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Debounce (segundos)</span>
            <input
              v-model.number="form.debounce_seconds"
              type="number"
              name="debounce_seconds"
              min="3"
              max="60"
              required
              :class="inputClass"
            />
            <span class="text-xs text-brand-ink/45">
              Entre 3 e 60. Padrão: 10. A IA espera esse tempo sem novas mensagens do paciente
              antes de responder; cada mensagem nova reinicia a contagem (espera máxima: 60s ou 3×
              o debounce).
            </span>
            <span
              v-if="fieldErrors.debounce_seconds"
              class="text-sm text-brand-ink/70"
              role="alert"
            >
              {{ fieldErrors.debounce_seconds }}
            </span>
          </label>

          <label
            class="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-ink/10 bg-[#f4f6f8]/70 px-4 py-3"
          >
            <input
              v-model="form.is_active"
              type="checkbox"
              name="is_active"
              class="mt-0.5 size-4 cursor-pointer rounded border-brand-ink/25 text-brand-blue focus:ring-brand-cyan/30"
            />
            <span class="min-w-0">
              <span class="block text-sm font-medium text-brand-ink">Ativar este agent</span>
              <span class="mt-0.5 block text-xs leading-snug text-brand-ink/55">
                Só um agent fica ativo por clínica. Ativar este desativa os demais.
              </span>
            </span>
          </label>
          <span v-if="fieldErrors.is_active" class="text-sm text-brand-ink/70" role="alert">
            {{ fieldErrors.is_active }}
          </span>
        </aside>
      </div>

      <section class="flex flex-col gap-4 rounded-xl border border-brand-ink/10 p-4">
        <label class="flex cursor-pointer items-start gap-3">
          <input
            v-model="form.limit_hours"
            type="checkbox"
            name="limit_hours"
            class="mt-0.5 size-4 cursor-pointer rounded border-brand-ink/25 text-brand-blue focus:ring-brand-cyan/30"
          />
          <span class="min-w-0">
            <span class="block text-sm font-medium text-brand-ink">
              Definir horário de funcionamento do agent
            </span>
            <span class="mt-0.5 block text-xs leading-snug text-brand-ink/55">
              Desmarcado, o agent responde 24 horas. Fora do horário definido ele não responde e as
              mensagens ficam na caixa do WhatsApp para a equipe.
            </span>
          </span>
        </label>

        <template v-if="form.limit_hours">
          <WeeklyHoursEditor
            v-model="form.working_hours"
            legend="Dias em que o agent responde"
            allow-overnight
            :day-errors="workingDayErrors"
            empty-message="Marque pelo menos um dia."
          />
          <p class="text-xs text-brand-ink/45">
            Para virar a madrugada, coloque o fim antes do início: sexta das 18:00 até 08:00 vale até
            sábado às 08:00.
          </p>
          <p v-if="fieldErrors.working_hours" class="text-sm text-brand-ink/70" role="alert">
            {{ fieldErrors.working_hours }}
          </p>
        </template>
      </section>

      <p
        v-if="formError"
        class="rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
        role="alert"
      >
        {{ formError }}
      </p>

      <div class="flex flex-wrap gap-2 border-t border-brand-ink/10 pt-4">
        <Button type="submit" icon="lucide:save" :loading="loading" :disabled="!canSubmit">
          {{ isEdit ? 'Salvar' : 'Cadastrar' }}
        </Button>
        <Button type="button" variant="secondary" :disabled="loading" @click="goBack">
          Cancelar
        </Button>
      </div>
    </form>
  </PageView>
</template>
