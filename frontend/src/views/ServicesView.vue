<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import {
  deleteService,
  listServices,
  type ClinicService,
} from '@/api/crm/services'
import { formatMoney } from '@/api/crm/types'
import Button from '@/components/Buttons/Button.vue'
import ContentSkeleton from '@/components/Feedback/ContentSkeleton.vue'
import PageView from '@/components/Layout/PageView.vue'
import ServiceFormModal from '@/components/Modals/ServiceFormModal.vue'

const services = ref<ClinicService[]>([])
const loading = ref(true)
const listError = ref('')
const search = ref('')
const formOpen = ref(false)
const editingService = ref<ClinicService | null>(null)
const deletingService = ref<ClinicService | null>(null)
const deleteLoading = ref(false)
const deleteError = ref('')
const flash = ref('')

const totalLabel = computed(() => {
  const n = services.value.length
  return n === 1 ? '1 serviço' : `${n} serviços`
})

function priceRange(service: ClinicService) {
  const min = formatMoney(service.price_particular_min)
  const max = formatMoney(service.price_particular_max)
  return min === max ? min : `${min} – ${max}`
}

function openCreate() {
  editingService.value = null
  formOpen.value = true
}

function openEdit(service: ClinicService) {
  editingService.value = service
  formOpen.value = true
}

function askDelete(service: ClinicService) {
  deletingService.value = service
  deleteError.value = ''
}

function closeDelete() {
  if (deleteLoading.value) return
  deletingService.value = null
  deleteError.value = ''
}

function onDeleteKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && deletingService.value) {
    event.preventDefault()
    closeDelete()
  }
}

async function loadServices() {
  loading.value = true
  listError.value = ''
  try {
    services.value = await listServices({
      q: search.value.trim() || undefined,
    })
  } catch (error) {
    if (error instanceof ApiError) {
      listError.value = error.message || 'Não foi possível carregar os serviços.'
    } else {
      listError.value = 'Servidor indisponível. Tente novamente.'
    }
  } finally {
    loading.value = false
  }
}

function onSearchSubmit() {
  void loadServices()
}

function onSaved(service: ClinicService) {
  flash.value = editingService.value
    ? `Serviço ${service.name} atualizado.`
    : `Serviço ${service.name} cadastrado.`
  void loadServices()
}

async function confirmDelete() {
  const target = deletingService.value
  if (!target || deleteLoading.value) return

  deleteLoading.value = true
  deleteError.value = ''

  try {
    await deleteService(target.id)
    flash.value = `Serviço ${target.name} excluído.`
    deletingService.value = null
    await loadServices()
  } catch (error) {
    if (error instanceof ApiError) {
      deleteError.value = error.message || 'Não foi possível excluir o serviço.'
    } else {
      deleteError.value = 'Servidor indisponível. Tente novamente.'
    }
  } finally {
    deleteLoading.value = false
  }
}

onMounted(() => {
  document.addEventListener('keydown', onDeleteKeydown)
  void loadServices()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onDeleteKeydown)
})
</script>

<template>
  <PageView title="Serviços">
    <template #actions>
      <Button icon="lucide:plus" @click="openCreate">Cadastrar</Button>
    </template>

    <p class="shrink-0 text-sm text-brand-ink/50">{{ totalLabel }}</p>
    <p
      v-if="flash"
      class="shrink-0 rounded-xl border border-brand-cyan/35 bg-brand-cyan/10 px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
      role="status"
    >
      {{ flash }}
    </p>

    <form
      class="flex shrink-0 flex-col gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4 sm:flex-row sm:items-center"
      @submit.prevent="onSearchSubmit"
    >
      <label class="relative min-w-0 flex-1">
        <span class="sr-only">Buscar serviços</span>
        <Icon
          icon="lucide:search"
          class="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-brand-ink/40"
          aria-hidden="true"
        />
        <input
          v-model="search"
          type="search"
          name="search"
          placeholder="Buscar por código ou nome"
          class="w-full rounded-xl border border-brand-ink/15 bg-white py-2.5 pr-4 pl-10 text-sm text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
        />
      </label>
      <Button
        type="submit"
        variant="secondary"
        icon="lucide:search"
        :loading="loading"
      >
        Pesquisar
      </Button>
    </form>

    <p
      v-if="listError"
      class="rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm text-brand-ink"
      role="alert"
    >
      {{ listError }}
    </p>

    <ContentSkeleton v-else-if="loading && services.length === 0" variant="table" :rows="8" />

    <p v-else-if="!loading && services.length === 0" class="text-sm text-brand-ink/55">
      Nenhum serviço encontrado.
    </p>

    <div v-else class="min-h-0 flex-1 overflow-auto">
      <table class="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead class="sticky top-0 bg-[#f4f6f8] text-brand-ink/55">
          <tr class="border-b border-brand-ink/10">
            <th class="px-4 py-3 font-medium">Código</th>
            <th class="px-4 py-3 font-medium">Nome</th>
            <th class="px-4 py-3 font-medium">Duração</th>
            <th class="px-4 py-3 font-medium">Preço particular</th>
            <th class="px-4 py-3 font-medium">Convênio</th>
            <th class="px-4 py-3 font-medium text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="service in services"
            :key="service.id"
            class="border-b border-brand-ink/5 transition hover:bg-white/70"
          >
            <td class="px-4 py-3 font-medium text-brand-ink">{{ service.code }}</td>
            <td class="px-4 py-3 text-brand-ink/80">
              <div class="font-medium text-brand-ink">{{ service.name }}</div>
              <p
                v-if="service.description"
                class="mt-0.5 line-clamp-1 text-xs text-brand-ink/50"
              >
                {{ service.description }}
              </p>
            </td>
            <td class="px-4 py-3 text-brand-ink/80">{{ service.duration_minutes }} min</td>
            <td class="px-4 py-3 text-brand-ink/80">{{ priceRange(service) }}</td>
            <td class="px-4 py-3">
              <span
                class="inline-flex rounded-lg px-2 py-1 text-xs font-medium"
                :class="
                  service.accepts_insurance
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-brand-ink/5 text-brand-ink/70'
                "
              >
                {{ service.accepts_insurance ? 'Sim' : 'Não' }}
              </span>
            </td>
            <td class="px-4 py-3">
              <div class="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  class="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-brand-ink/10 bg-white text-brand-ink/60 transition hover:border-brand-ink/20 hover:text-brand-ink"
                  title="Editar"
                  aria-label="Editar serviço"
                  @click="openEdit(service)"
                >
                  <Icon icon="lucide:pencil" class="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-brand-ink/10 bg-white text-brand-ink/60 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                  title="Excluir"
                  aria-label="Excluir serviço"
                  @click="askDelete(service)"
                >
                  <Icon icon="lucide:trash-2" class="size-4" aria-hidden="true" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ServiceFormModal
      v-model:open="formOpen"
      :service="editingService"
      @saved="onSaved"
    />

    <Teleport to="body">
      <div
        v-if="deletingService"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
        role="presentation"
        @click.self="closeDelete"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-service-title"
          class="w-full max-w-md rounded-2xl border border-brand-ink/10 bg-white p-5 shadow-2xl"
          @click.stop
        >
          <h2 id="delete-service-title" class="text-lg font-semibold text-brand-ink">
            Excluir serviço
          </h2>
          <p class="mt-2 text-sm leading-relaxed text-brand-ink/70">
            Tem certeza que deseja excluir
            <strong class="font-semibold text-brand-ink">{{ deletingService.name }}</strong
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
