<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import {
  deleteProduct,
  listProducts,
  PRODUCT_AUDIENCE_LABELS,
  PRODUCT_CATEGORY_LABELS,
  productSizeLabel,
  type ClinicProduct,
} from '@/api/crm/products'
import { formatMoney } from '@/api/crm/types'
import Button from '@/components/Buttons/Button.vue'
import ContentSkeleton from '@/components/Feedback/ContentSkeleton.vue'
import PageView from '@/components/Layout/PageView.vue'
import ProductFormModal from '@/components/Modals/ProductFormModal.vue'

const products = ref<ClinicProduct[]>([])
const loading = ref(true)
const listError = ref('')
const search = ref('')
const formOpen = ref(false)
const editingProduct = ref<ClinicProduct | null>(null)
const deletingProduct = ref<ClinicProduct | null>(null)
const deleteLoading = ref(false)
const deleteError = ref('')
const flash = ref('')

const totalLabel = computed(() => {
  const n = products.value.length
  return n === 1 ? '1 peça' : `${n} peças`
})

function sizesLabel(product: ClinicProduct): string {
  return product.sizes.map(productSizeLabel).join(' · ')
}

function openCreate() {
  editingProduct.value = null
  formOpen.value = true
}

function openEdit(product: ClinicProduct) {
  editingProduct.value = product
  formOpen.value = true
}

function askDelete(product: ClinicProduct) {
  deletingProduct.value = product
  deleteError.value = ''
}

function closeDelete() {
  if (deleteLoading.value) return
  deletingProduct.value = null
  deleteError.value = ''
}

function onDeleteKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && deletingProduct.value) {
    event.preventDefault()
    closeDelete()
  }
}

async function loadProducts() {
  loading.value = true
  listError.value = ''
  try {
    products.value = await listProducts({ q: search.value.trim() || undefined })
  } catch (error) {
    if (error instanceof ApiError) {
      listError.value = error.message || 'Não foi possível carregar os produtos.'
    } else {
      listError.value = 'Servidor indisponível. Tente novamente.'
    }
  } finally {
    loading.value = false
  }
}

function onSaved(product: ClinicProduct) {
  flash.value = editingProduct.value
    ? `Peça ${product.name} atualizada.`
    : `Peça ${product.name} cadastrada.`
  void loadProducts()
}

async function confirmDelete() {
  const target = deletingProduct.value
  if (!target || deleteLoading.value) return

  deleteLoading.value = true
  deleteError.value = ''

  try {
    await deleteProduct(target.id)
    flash.value = `Peça ${target.name} excluída.`
    deletingProduct.value = null
    await loadProducts()
  } catch (error) {
    if (error instanceof ApiError) {
      deleteError.value = error.message || 'Não foi possível excluir a peça.'
    } else {
      deleteError.value = 'Servidor indisponível. Tente novamente.'
    }
  } finally {
    deleteLoading.value = false
  }
}

onMounted(() => {
  document.addEventListener('keydown', onDeleteKeydown)
  void loadProducts()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onDeleteKeydown)
})
</script>

<template>
  <PageView title="Produtos">
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
      @submit.prevent="loadProducts"
    >
      <label class="relative min-w-0 flex-1">
        <span class="sr-only">Buscar produtos</span>
        <Icon
          icon="lucide:search"
          class="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-brand-ink/40"
          aria-hidden="true"
        />
        <input
          v-model="search"
          type="search"
          name="search"
          placeholder="Buscar por nome, cor ou descrição"
          class="w-full rounded-xl border border-brand-ink/15 bg-white py-2.5 pr-4 pl-10 text-sm text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
        />
      </label>
      <Button type="submit" variant="secondary" icon="lucide:search" :loading="loading">
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

    <ContentSkeleton v-else-if="loading && products.length === 0" variant="cards" :rows="6" />

    <p v-else-if="!loading && products.length === 0" class="text-sm text-brand-ink/55">
      Nenhuma peça encontrada.
    </p>

    <div
      v-else
      class="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto sm:grid-cols-2 xl:grid-cols-3"
    >
      <article
        v-for="product in products"
        :key="product.id"
        class="flex flex-col overflow-hidden rounded-2xl border border-brand-ink/10 bg-white"
      >
        <div class="aspect-[4/3] bg-brand-ink/5">
          <img
            v-if="product.image_url"
            :src="product.image_url"
            :alt="product.name"
            class="size-full object-cover"
          />
          <div v-else class="flex size-full items-center justify-center text-brand-ink/30">
            <Icon icon="lucide:shirt" class="size-10" aria-hidden="true" />
          </div>
        </div>
        <div class="flex flex-1 flex-col gap-2 p-4">
          <div class="flex flex-wrap items-center gap-1.5">
            <span
              class="rounded-lg bg-brand-cyan/15 px-2 py-0.5 text-xs font-medium text-brand-cyan-ink"
            >
              {{ PRODUCT_CATEGORY_LABELS[product.category] }}
            </span>
            <span
              class="rounded-lg bg-brand-ink/5 px-2 py-0.5 text-xs font-medium text-brand-ink/70"
            >
              {{ PRODUCT_AUDIENCE_LABELS[product.audience] }}
            </span>
            <span
              v-if="!product.active"
              class="rounded-lg bg-brand-ink/5 px-2 py-0.5 text-xs font-medium text-brand-ink/50"
            >
              Inativo
            </span>
          </div>
          <h2 class="text-base font-semibold text-brand-ink">{{ product.name }}</h2>
          <p v-if="product.sizes.length" class="flex items-start gap-1.5 text-sm text-brand-ink/65">
            <Icon icon="lucide:ruler" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {{ sizesLabel(product) }}
          </p>
          <p v-if="product.colors" class="flex items-start gap-1.5 text-sm text-brand-ink/65">
            <Icon icon="lucide:palette" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {{ product.colors }}
          </p>
          <p class="text-lg font-semibold text-brand-ink">{{ formatMoney(product.price) }}</p>
          <div class="mt-auto flex justify-end gap-1.5 pt-2">
            <button
              type="button"
              class="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-brand-ink/10 bg-white text-brand-ink/60 transition hover:border-brand-ink/20 hover:text-brand-ink"
              title="Editar"
              aria-label="Editar peça"
              @click="openEdit(product)"
            >
              <Icon icon="lucide:pencil" class="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-brand-ink/10 bg-white text-brand-ink/60 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              title="Excluir"
              aria-label="Excluir peça"
              @click="askDelete(product)"
            >
              <Icon icon="lucide:trash-2" class="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </article>
    </div>

    <ProductFormModal v-model:open="formOpen" :product="editingProduct" @saved="onSaved" />

    <Teleport to="body">
      <div
        v-if="deletingProduct"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
        role="presentation"
        v-backdrop-close="closeDelete"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-product-title"
          class="w-full max-w-md rounded-2xl border border-brand-ink/10 bg-white p-5 shadow-2xl"
          @click.stop
        >
          <h2 id="delete-product-title" class="text-lg font-semibold text-brand-ink">
            Excluir peça
          </h2>
          <p class="mt-2 text-sm leading-relaxed text-brand-ink/70">
            Tem certeza que deseja excluir
            <strong class="font-semibold text-brand-ink">{{ deletingProduct.name }}</strong
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
            <Button variant="danger" size="sm" :loading="deleteLoading" @click="confirmDelete">
              Excluir
            </Button>
            <Button variant="secondary" size="sm" :disabled="deleteLoading" @click="closeDelete">
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </Teleport>
  </PageView>
</template>
