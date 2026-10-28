<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { toApiError } from '@/api/client'
import {
  deleteKnowledgeEntry,
  listKnowledgeEntries,
  updateKnowledgeEntry,
  type KnowledgeCategory,
  type KnowledgeEntry,
} from '@/api/crm/knowledge'
import Button from '@/components/Buttons/Button.vue'
import ContentSkeleton from '@/components/Feedback/ContentSkeleton.vue'
import PageView from '@/components/Layout/PageView.vue'
import ConfirmModal from '@/components/Modals/ConfirmModal.vue'
import KnowledgeEntryModal from '@/components/Modals/KnowledgeEntryModal.vue'
import { KNOWLEDGE_CATEGORIES } from '@/utils/knowledgeCategories'

const entries = ref<KnowledgeEntry[]>([])
const loading = ref(true)
const listError = ref('')
const flash = ref('')

const formOpen = ref(false)
const editingEntry = ref<KnowledgeEntry | null>(null)
const formCategory = ref<KnowledgeCategory>('horarios')

const deleteOpen = ref(false)
const deletingEntry = ref<KnowledgeEntry | null>(null)
const deleteLoading = ref(false)
const togglingId = ref<number | null>(null)

const byCategory = computed(() => {
  const map = new Map<KnowledgeCategory, KnowledgeEntry[]>()
  for (const entry of entries.value) {
    const list = map.get(entry.category) ?? []
    list.push(entry)
    map.set(entry.category, list)
  }
  return map
})

const filledCategories = computed(
  () =>
    KNOWLEDGE_CATEGORIES.filter((c) => (byCategory.value.get(c.value) ?? []).some((e) => e.active))
      .length,
)

async function load() {
  loading.value = true
  listError.value = ''
  try {
    entries.value = await listKnowledgeEntries()
  } catch (error) {
    listError.value =
      toApiError(error).message || 'Não foi possível carregar a base de conhecimento.'
  } finally {
    loading.value = false
  }
}

function openCreate(category: KnowledgeCategory) {
  editingEntry.value = null
  formCategory.value = category
  formOpen.value = true
}

function openEdit(entry: KnowledgeEntry) {
  editingEntry.value = entry
  formCategory.value = entry.category
  formOpen.value = true
}

function onSaved(entry: KnowledgeEntry) {
  flash.value = editingEntry.value ? 'Resposta atualizada.' : 'Resposta adicionada.'
  const idx = entries.value.findIndex((e) => e.id === entry.id)
  if (idx >= 0) entries.value.splice(idx, 1, entry)
  else entries.value.push(entry)
}

async function toggleActive(entry: KnowledgeEntry) {
  if (togglingId.value) return
  togglingId.value = entry.id
  try {
    onSaved(await updateKnowledgeEntry(entry.id, { active: !entry.active }))
    flash.value = entry.active ? 'Resposta desativada.' : 'Resposta ativada.'
  } catch (error) {
    flash.value = toApiError(error).message || 'Não foi possível atualizar.'
  } finally {
    togglingId.value = null
  }
}

function askDelete(entry: KnowledgeEntry) {
  deletingEntry.value = entry
  deleteOpen.value = true
}

async function confirmDelete() {
  const target = deletingEntry.value
  if (!target || deleteLoading.value) return
  deleteLoading.value = true
  try {
    await deleteKnowledgeEntry(target.id)
    entries.value = entries.value.filter((e) => e.id !== target.id)
    flash.value = 'Resposta excluída.'
    deleteOpen.value = false
  } catch (error) {
    flash.value = toApiError(error).message || 'Não foi possível excluir.'
  } finally {
    deleteLoading.value = false
  }
}

onMounted(load)
</script>

<template>
  <PageView title="Base de conhecimento">
    <p class="shrink-0 text-sm text-brand-ink/55">
      Respostas prontas que a IA consulta para responder pacientes no WhatsApp.
      <span class="text-brand-ink/40"
        >· {{ filledCategories }}/{{ KNOWLEDGE_CATEGORIES.length }} categorias preenchidas</span
      >
    </p>

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

    <ContentSkeleton v-else-if="loading" variant="cards" />

    <div v-else class="min-h-0 flex-1 overflow-y-auto">
      <div class="grid gap-4 pb-4 lg:grid-cols-2">
        <section
          v-for="category in KNOWLEDGE_CATEGORIES"
          :key="category.value"
          class="flex flex-col rounded-2xl border border-brand-ink/10 bg-white p-4"
        >
          <header class="flex items-start gap-3">
            <span
              class="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-cyan/15 text-brand-cyan-ink"
              aria-hidden="true"
            >
              <Icon :icon="category.icon" class="size-5" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-semibold text-brand-ink">{{ category.label }}</h2>
              <p class="text-xs text-brand-ink/50">{{ category.hint }}</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              icon="lucide:plus"
              @click="openCreate(category.value)"
            >
              Adicionar
            </Button>
          </header>

          <ul v-if="(byCategory.get(category.value) ?? []).length" class="mt-3 flex flex-col gap-2">
            <li
              v-for="entry in byCategory.get(category.value)"
              :key="entry.id"
              class="group rounded-xl border border-brand-ink/10 bg-[#f8fafb] px-3.5 py-3"
              :class="entry.active ? '' : 'opacity-55'"
            >
              <div class="flex items-start gap-2">
                <div class="min-w-0 flex-1">
                  <p v-if="entry.title" class="text-sm font-medium text-brand-ink">
                    {{ entry.title }}
                  </p>
                  <p class="text-sm leading-relaxed whitespace-pre-line text-brand-ink/75">
                    {{ entry.content }}
                  </p>
                  <p v-if="!entry.active" class="mt-1 text-xs font-medium text-brand-ink/50">
                    Desativada
                  </p>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    class="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-brand-ink/50 transition hover:bg-white hover:text-brand-ink disabled:opacity-40"
                    :title="entry.active ? 'Desativar' : 'Ativar'"
                    :aria-label="entry.active ? 'Desativar resposta' : 'Ativar resposta'"
                    :disabled="togglingId === entry.id"
                    @click="toggleActive(entry)"
                  >
                    <Icon
                      :icon="entry.active ? 'lucide:eye' : 'lucide:eye-off'"
                      class="size-4"
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    class="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-brand-ink/50 transition hover:bg-white hover:text-brand-ink"
                    title="Editar"
                    aria-label="Editar resposta"
                    @click="openEdit(entry)"
                  >
                    <Icon icon="lucide:pencil" class="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-brand-ink/50 transition hover:bg-red-50 hover:text-red-700"
                    title="Excluir"
                    aria-label="Excluir resposta"
                    @click="askDelete(entry)"
                  >
                    <Icon icon="lucide:trash-2" class="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </li>
          </ul>
          <p
            v-else
            class="mt-3 rounded-xl border border-dashed border-brand-ink/15 px-3.5 py-3 text-sm text-brand-ink/45"
          >
            Nada cadastrado. Sem isso a IA vai dizer que precisa verificar com a equipe.
          </p>
        </section>
      </div>
    </div>

    <KnowledgeEntryModal
      v-model:open="formOpen"
      :entry="editingEntry"
      :category="formCategory"
      @saved="onSaved"
    />

    <ConfirmModal
      v-model:open="deleteOpen"
      title="Excluir resposta"
      message="A IA deixará de usar esta informação. Deseja excluir?"
      confirm-label="Excluir"
      confirm-variant="danger"
      :busy="deleteLoading"
      @confirm="confirmDelete"
    />
  </PageView>
</template>
