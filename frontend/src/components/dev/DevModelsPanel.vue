<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import { listClinics, type Clinic } from '@/api/clinics'
import Button from '@/components/Buttons/Button.vue'
import ContentSkeleton from '@/components/Feedback/ContentSkeleton.vue'
import ConfirmModal from '@/components/Modals/ConfirmModal.vue'
import { useClinicsStore } from '@/stores/clinics'
import { templateLabel } from '@/utils/businessTemplate'

const clinicsStore = useClinicsStore()

const models = ref<Clinic[]>([])
const loading = ref(true)
const listError = ref('')
const flash = ref('')
const deleting = ref<Clinic | null>(null)
const deleteLoading = ref(false)
const deleteOpen = computed({
  get: () => deleting.value !== null,
  set: (value: boolean) => {
    if (!value && !deleteLoading.value) deleting.value = null
  },
})

const totalLabel = computed(() => {
  const n = models.value.length
  return n === 1 ? '1 modelo' : `${n} modelos`
})

const confirmMessage = computed(() => {
  const name = deleting.value?.name || 'este modelo'
  return `Isso apaga ${name} e toda a base: CRM, WhatsApp, serviços/imóveis/produtos, knowledge, agents e agendamentos. Os usuários vinculados ficam sem modelo. Esta ação não pode ser desfeita.`
})

async function load() {
  loading.value = true
  listError.value = ''
  try {
    models.value = await listClinics()
  } catch (error) {
    listError.value =
      error instanceof ApiError ? error.message : 'Não foi possível carregar os modelos.'
  } finally {
    loading.value = false
  }
}

function askDelete(model: Clinic) {
  deleting.value = model
}

async function confirmDelete() {
  const target = deleting.value
  if (!target || deleteLoading.value) return

  deleteLoading.value = true
  try {
    await clinicsStore.removeClinic(target.id)
    flash.value = `Modelo ${target.name} excluído.`
    deleting.value = null
    await load()
  } catch (error) {
    listError.value =
      error instanceof ApiError ? error.message : 'Não foi possível excluir o modelo.'
    deleting.value = null
  } finally {
    deleteLoading.value = false
  }
}

onMounted(() => {
  void load()
})

defineExpose({ load })
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-brand-ink/55">{{ totalLabel }}</p>
      <Button variant="secondary" size="sm" icon="lucide:refresh-cw" :loading="loading" @click="load">
        Atualizar
      </Button>
    </div>

    <p
      v-if="flash"
      class="rounded-xl border border-brand-cyan/35 bg-brand-cyan/10 px-3.5 py-2.5 text-sm text-brand-ink"
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

    <ContentSkeleton v-else-if="loading && models.length === 0" variant="table" :rows="6" />

    <p v-else-if="!loading && models.length === 0" class="text-sm text-brand-ink/55">
      Nenhum modelo cadastrado.
    </p>

    <div v-else class="overflow-auto rounded-2xl border border-brand-ink/10 bg-white">
      <table class="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead class="bg-[#f8fafb] text-brand-ink/55">
          <tr class="border-b border-brand-ink/10">
            <th class="px-4 py-3 font-medium">Nome</th>
            <th class="px-4 py-3 font-medium">Template</th>
            <th class="px-4 py-3 font-medium">Slug</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="model in models"
            :key="model.id"
            class="border-b border-brand-ink/5 last:border-0"
          >
            <td class="px-4 py-3 font-medium text-brand-ink">
              {{ model.name }}
              <span
                v-if="model.id === clinicsStore.activeClinicId"
                class="ml-2 rounded-lg bg-brand-cyan/15 px-1.5 py-0.5 text-[11px] font-medium text-brand-cyan-ink"
              >
                ativo no painel
              </span>
            </td>
            <td class="px-4 py-3 text-brand-ink/75">{{ templateLabel(model.template) }}</td>
            <td class="px-4 py-3 font-mono text-xs text-brand-ink/60">{{ model.slug }}</td>
            <td class="px-4 py-3">
              <span
                class="inline-flex rounded-lg px-2 py-1 text-xs font-medium"
                :class="
                  model.is_active
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-brand-ink/5 text-brand-ink/60'
                "
              >
                {{ model.is_active ? 'Ativo' : 'Inativo' }}
              </span>
            </td>
            <td class="px-4 py-3">
              <div class="flex justify-end">
                <button
                  type="button"
                  class="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-brand-ink/10 bg-white text-brand-ink/60 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                  title="Excluir modelo e toda a base"
                  aria-label="Excluir modelo"
                  @click="askDelete(model)"
                >
                  <Icon icon="lucide:trash-2" class="size-4" aria-hidden="true" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ConfirmModal
      v-model:open="deleteOpen"
      title="Excluir modelo"
      :message="confirmMessage"
      confirm-label="Excluir tudo"
      confirm-variant="danger"
      :busy="deleteLoading"
      @confirm="confirmDelete"
    />
  </div>
</template>
