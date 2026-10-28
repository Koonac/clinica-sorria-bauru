<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import {
  createKnowledgeEntry,
  updateKnowledgeEntry,
  type KnowledgeCategory,
  type KnowledgeEntry,
} from '@/api/crm/knowledge'
import Button from '@/components/Buttons/Button.vue'
import { KNOWLEDGE_CATEGORIES } from '@/utils/knowledgeCategories'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  entry: KnowledgeEntry | null
  category: KnowledgeCategory
}>()

const emit = defineEmits<{
  saved: [entry: KnowledgeEntry]
}>()

const inputClass =
  'w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25'

const isEdit = computed(() => Boolean(props.entry))
const categoryMeta = computed(
  () => KNOWLEDGE_CATEGORIES.find((c) => c.value === form.category) ?? KNOWLEDGE_CATEGORIES[0]!,
)

const form = reactive({
  category: 'horarios' as KnowledgeCategory,
  title: '',
  content: '',
  active: true,
})
const fieldErrors = reactive({ title: '', content: '' })
const loading = ref(false)
const formError = ref('')
const panelRef = ref<HTMLElement | null>(null)

const canSubmit = computed(() => !loading.value && form.content.trim() !== '')

function resetForm() {
  form.category = props.entry?.category ?? props.category
  form.title = props.entry?.title ?? ''
  form.content = props.entry?.content ?? ''
  form.active = props.entry?.active ?? true
  fieldErrors.title = ''
  fieldErrors.content = ''
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
    resetForm()
    document.addEventListener('keydown', onKeydown)
    requestAnimationFrame(() => {
      panelRef.value?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
    })
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})

async function onSubmit() {
  if (!canSubmit.value) return
  loading.value = true
  formError.value = ''
  fieldErrors.title = ''
  fieldErrors.content = ''

  const payload = {
    category: form.category,
    title: form.title.trim() || null,
    content: form.content.trim(),
    active: form.active,
  }

  try {
    const saved =
      isEdit.value && props.entry
        ? await updateKnowledgeEntry(props.entry.id, payload)
        : await createKnowledgeEntry(payload)
    emit('saved', saved)
    close()
  } catch (error) {
    if (error instanceof ApiError) {
      fieldErrors.title = error.details?.title?.[0] || ''
      fieldErrors.content = error.details?.content?.[0] || ''
      if (!fieldErrors.title && !fieldErrors.content) {
        formError.value = error.message || 'Não foi possível salvar a resposta.'
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
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      v-backdrop-close="close"
    >
      <div
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="knowledge-entry-title"
        class="flex max-h-[min(90vh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-brand-ink/10 bg-white shadow-2xl"
        @click.stop
      >
        <header
          class="flex shrink-0 items-start justify-between gap-3 border-b border-brand-ink/10 px-5 pt-5 pb-4"
        >
          <div class="min-w-0">
            <p
              class="mb-1 text-[0.65rem] font-medium tracking-[0.22em] text-brand-cyan-ink uppercase"
            >
              {{ categoryMeta.label }}
            </p>
            <h2
              id="knowledge-entry-title"
              class="text-xl font-semibold tracking-tight text-brand-ink"
            >
              {{ isEdit ? 'Editar resposta' : 'Nova resposta' }}
            </h2>
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
            <span class="text-sm font-medium text-brand-ink/80">Categoria</span>
            <select v-model="form.category" name="category" :class="inputClass">
              <option v-for="c in KNOWLEDGE_CATEGORIES" :key="c.value" :value="c.value">
                {{ c.label }}
              </option>
            </select>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">
              Título <span class="font-normal text-brand-ink/45">(opcional)</span>
            </span>
            <input
              v-model="form.title"
              type="text"
              name="title"
              maxlength="190"
              :placeholder="categoryMeta.titlePlaceholder"
              :class="inputClass"
            />
            <span v-if="fieldErrors.title" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.title }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Resposta</span>
            <textarea
              v-model="form.content"
              name="content"
              rows="6"
              maxlength="4000"
              required
              :placeholder="categoryMeta.contentPlaceholder"
              :class="[inputClass, 'resize-y leading-relaxed']"
            />
            <span class="text-xs text-brand-ink/45">
              A IA usa este texto como fonte oficial. Escreva como você responderia ao paciente.
            </span>
            <span v-if="fieldErrors.content" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.content }}
            </span>
          </label>

          <label class="flex cursor-pointer items-center gap-2.5 text-sm text-brand-ink/80">
            <input
              v-model="form.active"
              type="checkbox"
              class="size-4 rounded border-brand-ink/30 accent-brand-cyan"
            />
            Ativa (a IA pode usar)
          </label>

          <p
            v-if="formError"
            class="rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm text-brand-ink"
            role="alert"
          >
            {{ formError }}
          </p>

          <div class="mt-auto flex flex-wrap gap-2 pt-1">
            <Button type="submit" :loading="loading" :disabled="!canSubmit">
              {{ isEdit ? 'Salvar' : 'Adicionar' }}
            </Button>
            <Button type="button" variant="secondary" :disabled="loading" @click="close">
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
