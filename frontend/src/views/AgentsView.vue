<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import {
  activateAgent,
  deactivateAgent,
  deleteAgent,
  listAgents,
  type Agent,
} from '@/api/crm/agents'
import Button from '@/components/Buttons/Button.vue'
import ContentSkeleton from '@/components/Feedback/ContentSkeleton.vue'
import PageView from '@/components/Layout/PageView.vue'
import AgentFormModal from '@/components/Modals/AgentFormModal.vue'

const agents = ref<Agent[]>([])
const loading = ref(true)
const listError = ref('')
const formOpen = ref(false)
const editingAgent = ref<Agent | null>(null)
const deletingAgent = ref<Agent | null>(null)
const deleteLoading = ref(false)
const deleteError = ref('')
const actionId = ref<number | null>(null)
const actionError = ref('')
const flash = ref('')

const totalLabel = computed(() => {
  const n = agents.value.length
  return n === 1 ? '1 agent' : `${n} agents`
})

function modelLabel(agent: Agent) {
  return agent.model?.trim() || 'Padrão'
}

function openCreate() {
  editingAgent.value = null
  formOpen.value = true
}

function openEdit(agent: Agent) {
  editingAgent.value = agent
  formOpen.value = true
}

function askDelete(agent: Agent) {
  deletingAgent.value = agent
  deleteError.value = ''
}

function closeDelete() {
  if (deleteLoading.value) return
  deletingAgent.value = null
  deleteError.value = ''
}

function onDeleteKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && deletingAgent.value) {
    event.preventDefault()
    closeDelete()
  }
}

async function loadAgents() {
  loading.value = true
  listError.value = ''
  try {
    agents.value = await listAgents()
  } catch (error) {
    if (error instanceof ApiError) {
      listError.value = error.message || 'Não foi possível carregar os agents.'
    } else {
      listError.value = 'Servidor indisponível. Tente novamente.'
    }
  } finally {
    loading.value = false
  }
}

function onSaved(agent: Agent) {
  flash.value = editingAgent.value
    ? `Agent ${agent.name} atualizado.`
    : `Agent ${agent.name} cadastrado.`
  actionError.value = ''
  void loadAgents()
}

async function toggleActive(agent: Agent) {
  if (actionId.value != null) return

  actionId.value = agent.id
  actionError.value = ''

  try {
    if (agent.is_active) {
      await deactivateAgent(agent.id)
      flash.value = `Agent ${agent.name} desativado.`
    } else {
      await activateAgent(agent.id)
      flash.value = `Agent ${agent.name} ativado.`
    }
    await loadAgents()
  } catch (error) {
    if (error instanceof ApiError) {
      actionError.value =
        error.details?.system_prompt?.[0] ||
        error.message ||
        'Não foi possível alterar o status do agent.'
    } else {
      actionError.value = 'Servidor indisponível. Tente novamente.'
    }
  } finally {
    actionId.value = null
  }
}

async function confirmDelete() {
  const target = deletingAgent.value
  if (!target || deleteLoading.value) return

  deleteLoading.value = true
  deleteError.value = ''

  try {
    await deleteAgent(target.id)
    flash.value = `Agent ${target.name} excluído.`
    deletingAgent.value = null
    await loadAgents()
  } catch (error) {
    if (error instanceof ApiError) {
      deleteError.value = error.message || 'Não foi possível excluir o agent.'
    } else {
      deleteError.value = 'Servidor indisponível. Tente novamente.'
    }
  } finally {
    deleteLoading.value = false
  }
}

onMounted(() => {
  document.addEventListener('keydown', onDeleteKeydown)
  void loadAgents()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onDeleteKeydown)
})
</script>

<template>
  <PageView title="Agents">
    <template #actions>
      <Button icon="lucide:bot" @click="openCreate">Novo agent</Button>
    </template>

    <p class="shrink-0 text-sm text-brand-ink/50">{{ totalLabel }}</p>
    <p
      v-if="flash"
      class="shrink-0 rounded-xl border border-brand-cyan/35 bg-brand-cyan/10 px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
      role="status"
    >
      {{ flash }}
    </p>

    <p
      v-if="actionError"
      class="shrink-0 rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm text-brand-ink"
      role="alert"
    >
      {{ actionError }}
    </p>

    <p
      v-if="listError"
      class="rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm text-brand-ink"
      role="alert"
    >
      {{ listError }}
    </p>

    <ContentSkeleton v-else-if="loading && agents.length === 0" variant="table" :rows="6" />

    <p v-else-if="!loading && agents.length === 0" class="text-sm text-brand-ink/55">
      Nenhum agent cadastrado. Crie um para atender leads no WhatsApp.
    </p>

    <div v-else class="min-h-0 flex-1 overflow-auto">
      <table class="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead class="sticky top-0 bg-[#f4f6f8] text-brand-ink/55">
          <tr class="border-b border-brand-ink/10">
            <th class="px-4 py-3 font-medium">Nome</th>
            <th class="px-4 py-3 font-medium">Modelo</th>
            <th class="px-4 py-3 font-medium">Debounce</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="agent in agents"
            :key="agent.id"
            class="border-b border-brand-ink/5 transition hover:bg-white/70"
          >
            <td class="px-4 py-3 font-medium text-brand-ink">{{ agent.name }}</td>
            <td class="px-4 py-3 text-brand-ink/80">{{ modelLabel(agent) }}</td>
            <td class="px-4 py-3 text-brand-ink/80">{{ agent.debounce_seconds }}s</td>
            <td class="px-4 py-3">
              <span
                class="inline-flex rounded-lg px-2 py-1 text-xs font-medium"
                :class="
                  agent.is_active
                    ? 'bg-brand-cyan/15 text-brand-cyan-ink'
                    : 'bg-brand-ink/5 text-brand-ink/70'
                "
              >
                {{ agent.is_active ? 'Ativo' : 'Inativo' }}
              </span>
            </td>
            <td class="px-4 py-3">
              <div class="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  class="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-brand-ink/10 bg-white text-brand-ink/60 transition hover:border-brand-ink/20 hover:text-brand-ink disabled:cursor-not-allowed disabled:opacity-40"
                  :title="agent.is_active ? 'Desativar' : 'Ativar'"
                  :aria-label="agent.is_active ? 'Desativar agent' : 'Ativar agent'"
                  :disabled="actionId === agent.id"
                  @click="toggleActive(agent)"
                >
                  <Icon
                    :icon="agent.is_active ? 'lucide:pause' : 'lucide:play'"
                    class="size-4"
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  class="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-brand-ink/10 bg-white text-brand-ink/60 transition hover:border-brand-ink/20 hover:text-brand-ink"
                  title="Editar"
                  aria-label="Editar agent"
                  @click="openEdit(agent)"
                >
                  <Icon icon="lucide:pencil" class="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-brand-ink/10 bg-white text-brand-ink/60 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                  title="Excluir"
                  aria-label="Excluir agent"
                  @click="askDelete(agent)"
                >
                  <Icon icon="lucide:trash-2" class="size-4" aria-hidden="true" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AgentFormModal v-model:open="formOpen" :agent="editingAgent" @saved="onSaved" />

    <Teleport to="body">
      <div
        v-if="deletingAgent"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
        role="presentation"
        @click.self="closeDelete"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-agent-title"
          class="w-full max-w-md rounded-2xl border border-brand-ink/10 bg-white p-5 shadow-2xl"
          @click.stop
        >
          <h2 id="delete-agent-title" class="text-lg font-semibold text-brand-ink">
            Excluir agent
          </h2>
          <p class="mt-2 text-sm leading-relaxed text-brand-ink/70">
            Tem certeza que deseja excluir
            <strong class="font-semibold text-brand-ink">{{ deletingAgent.name }}</strong
            >? Esta ação não pode ser desfeita.
          </p>

          <p
            v-if="deleteError"
            class="mt-3 rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm text-brand-ink"
            role="alert"
          >
            {{ deleteError }}
          </p>

          <div class="mt-5 flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="sm"
              :loading="deleteLoading"
              @click="confirmDelete"
            >
              Excluir
            </Button>
            <Button
              variant="secondary"
              size="sm"
              :disabled="deleteLoading"
              @click="closeDelete"
            >
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </Teleport>
  </PageView>
</template>
