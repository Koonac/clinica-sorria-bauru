<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import { createTask, deleteTask, updateTask } from '@/api/crm/tasks'
import type { CrmTask } from '@/api/crm/types'
import Button from '@/components/Buttons/Button.vue'
import Select from '@/components/Forms/Select.vue'
import {
  fromLocalInputValue,
  inputClass,
  labelClass,
  toLocalInputValue,
} from '@/utils/crmFormat'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  task: CrmTask | null
  defaultDueAt?: string | null
  leadOptions: Array<{ id: number; label: string }>
  dealOptions: Array<{ id: number; label: string }>
}>()

const emit = defineEmits<{
  saved: []
  deleted: []
}>()

const leadSelectOptions = computed(() =>
  props.leadOptions.map((o) => ({ value: o.id, label: o.label })),
)

const dealSelectOptions = computed(() =>
  props.dealOptions.map((o) => ({ value: o.id, label: o.label })),
)

const loading = ref(false)
const formError = ref('')
const linkKind = ref<'lead' | 'deal'>('lead')
const form = reactive({
  title: '',
  description: '',
  due_at: '',
  lead_id: '' as string | number,
  deal_id: '' as string | number,
  done: false,
})

const isEdit = computed(() => Boolean(props.task))
const title = computed(() => (isEdit.value ? 'Editar tarefa' : 'Nova tarefa'))

function reset() {
  form.title = props.task?.title ?? ''
  form.description = props.task?.description ?? ''
  form.due_at = toLocalInputValue(
    props.task?.due_at || props.defaultDueAt || new Date().toISOString(),
  )
  form.done = Boolean(props.task?.done_at)
  if (props.task?.deal_id) {
    linkKind.value = 'deal'
    form.deal_id = props.task.deal_id
    form.lead_id = ''
  } else {
    linkKind.value = 'lead'
    form.lead_id = props.task?.lead_id ?? ''
    form.deal_id = ''
  }
  formError.value = ''
  loading.value = false
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

async function submit() {
  if (!form.title.trim() || !form.due_at || loading.value) return
  if (linkKind.value === 'lead' && !form.lead_id) {
    formError.value = 'Selecione um lead.'
    return
  }
  if (linkKind.value === 'deal' && !form.deal_id) {
    formError.value = 'Selecione um negócio.'
    return
  }

  loading.value = true
  formError.value = ''
  try {
    const dueAt = fromLocalInputValue(form.due_at)
    if (props.task) {
      await updateTask(props.task.id, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_at: dueAt,
        done: form.done,
      })
    } else {
      await createTask({
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_at: dueAt,
        lead_id: linkKind.value === 'lead' ? Number(form.lead_id) : null,
        deal_id: linkKind.value === 'deal' ? Number(form.deal_id) : null,
      })
    }
    emit('saved')
    close()
  } catch (error) {
    formError.value =
      error instanceof ApiError ? error.message : 'Não foi possível salvar a tarefa.'
  } finally {
    loading.value = false
  }
}

async function remove() {
  if (!props.task || !confirm('Excluir esta tarefa?')) return
  loading.value = true
  try {
    await deleteTask(props.task.id)
    emit('deleted')
    close()
  } catch (error) {
    formError.value =
      error instanceof ApiError ? error.message : 'Não foi possível excluir.'
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
      @click.self="close"
    >
      <div
        role="dialog"
        aria-modal="true"
        class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-[0.7rem] font-medium tracking-[0.2em] text-brand-cyan-ink uppercase">
              Agenda
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
            <label :class="labelClass" for="ag-title">Título</label>
            <input id="ag-title" v-model="form.title" required :class="inputClass" />
          </div>
          <div>
            <label :class="labelClass" for="ag-due">Data e hora</label>
            <input id="ag-due" v-model="form.due_at" type="datetime-local" required :class="inputClass" />
          </div>
          <div>
            <label :class="labelClass" for="ag-desc">Descrição</label>
            <textarea id="ag-desc" v-model="form.description" rows="3" :class="inputClass" />
          </div>

          <div v-if="!isEdit" class="space-y-3">
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-full px-3 py-1.5 text-sm font-medium"
                :class="
                  linkKind === 'lead'
                    ? 'bg-brand-cyan text-brand-ink'
                    : 'bg-[#f4f6f8] text-brand-ink/60'
                "
                @click="linkKind = 'lead'"
              >
                Lead
              </button>
              <button
                type="button"
                class="rounded-full px-3 py-1.5 text-sm font-medium"
                :class="
                  linkKind === 'deal'
                    ? 'bg-brand-cyan text-brand-ink'
                    : 'bg-[#f4f6f8] text-brand-ink/60'
                "
                @click="linkKind = 'deal'"
              >
                Negócio
              </button>
            </div>
            <div v-if="linkKind === 'lead'">
              <label :class="labelClass" for="ag-lead">Lead</label>
              <Select
                id="ag-lead"
                v-model="form.lead_id"
                required
                placeholder="Selecione…"
                :options="leadSelectOptions"
              />
            </div>
            <div v-else>
              <label :class="labelClass" for="ag-deal">Negócio</label>
              <Select
                id="ag-deal"
                v-model="form.deal_id"
                required
                placeholder="Selecione…"
                :options="dealSelectOptions"
              />
            </div>
          </div>
          <div v-else class="rounded-xl bg-[#f4f6f8] px-3 py-2 text-sm text-brand-ink/65">
            <span v-if="task?.lead">Lead: {{ task.lead.name }}</span>
            <span v-else-if="task?.deal">Negócio: {{ task.deal.title }}</span>
            <span v-else>Vínculo CRM</span>
          </div>

          <label v-if="isEdit" class="flex items-center gap-2 text-sm text-brand-ink">
            <input v-model="form.done" type="checkbox" class="size-4 rounded border-brand-ink/20" />
            Concluída
          </label>

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
              <Button type="submit" :loading="loading">Salvar</Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
