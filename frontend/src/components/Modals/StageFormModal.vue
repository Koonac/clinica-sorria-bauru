<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import { createStage, updateStage } from '@/api/crm/pipeline'
import type { PipelineKind, PipelineStage, StageStatus } from '@/api/crm/types'
import { stageStatus } from '@/api/crm/types'
import Button from '@/components/Buttons/Button.vue'
import Select from '@/components/Forms/Select.vue'
import { inputClass, labelClass } from '@/utils/crmFormat'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  kind: PipelineKind
  stage: PipelineStage | null
}>()

const emit = defineEmits<{
  saved: []
}>()

const statusOptions = [
  { value: 'open', label: 'Aberto' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'won', label: 'Ganho' },
  { value: 'lost', label: 'Perdido' },
] as const

const loading = ref(false)
const formError = ref('')
const form = reactive({
  name: '',
  color: '#6b7280',
  status: 'open' as StageStatus,
})

const isEdit = computed(() => Boolean(props.stage))
const title = computed(() => (isEdit.value ? 'Editar coluna' : 'Nova coluna'))

function reset() {
  form.name = props.stage?.name ?? ''
  form.color = props.stage?.color || '#6b7280'
  form.status = props.stage ? stageStatus(props.stage) : 'open'
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
  if (!form.name.trim() || loading.value) return
  loading.value = true
  formError.value = ''
  try {
    if (props.stage) {
      await updateStage(props.stage.id, {
        name: form.name.trim(),
        color: form.color,
        status: form.status,
      })
    } else {
      await createStage({
        kind: props.kind,
        name: form.name.trim(),
        color: form.color,
        status: form.status,
      })
    }
    emit('saved')
    close()
  } catch (error) {
    formError.value =
      error instanceof ApiError ? error.message : 'Não foi possível salvar a coluna.'
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
      <div role="dialog" aria-modal="true" class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div class="flex items-start justify-between gap-3">
          <h2 class="text-xl font-semibold text-brand-ink">{{ title }}</h2>
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
            <label :class="labelClass" for="stage-name">Nome</label>
            <input id="stage-name" v-model="form.name" required :class="inputClass" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label :class="labelClass" for="stage-color">Cor</label>
              <input id="stage-color" v-model="form.color" type="color" class="h-11 w-full rounded-xl border border-brand-ink/15" />
            </div>
            <div>
              <label :class="labelClass" for="stage-status">Status</label>
              <Select
                id="stage-status"
                v-model="form.status"
                :options="[...statusOptions]"
              />
            </div>
          </div>

          <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>

          <div class="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" @click="close">Cancelar</Button>
            <Button type="submit" :loading="loading">Salvar</Button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
