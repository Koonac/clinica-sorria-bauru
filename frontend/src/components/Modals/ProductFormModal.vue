<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import {
  createProduct,
  updateProduct,
  PRODUCT_AUDIENCE_LABELS,
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_SIZES,
  productSizeLabel,
  type ClinicProduct,
  type ProductAudience,
  type ProductCategory,
  type ProductSize,
} from '@/api/crm/products'
import Button from '@/components/Buttons/Button.vue'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  product: ClinicProduct | null
}>()

const emit = defineEmits<{
  saved: [product: ClinicProduct]
}>()

const inputClass =
  'w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25'

const isEdit = computed(() => Boolean(props.product))

const form = reactive({
  name: '',
  description: '',
  price: '',
  category: 'camiseta' as ProductCategory,
  audience: 'feminino' as ProductAudience,
  sizes: [] as ProductSize[],
  colors: '',
  active: true,
})

const fieldErrors = reactive({
  name: '',
  description: '',
  price: '',
  category: '',
  audience: '',
  sizes: '',
  colors: '',
  image: '',
})

const imageFile = ref<File | null>(null)
const imagePreview = ref('')
const removeImage = ref(false)
const loading = ref(false)
const formError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const canSubmit = computed(() => {
  if (loading.value) return false
  return Boolean(form.name.trim() && form.price)
})

const currentImageUrl = computed(() => {
  if (imagePreview.value) return imagePreview.value
  if (removeImage.value) return ''
  return props.product?.image_url || ''
})

function clearFieldErrors() {
  for (const key of Object.keys(fieldErrors) as (keyof typeof fieldErrors)[]) {
    fieldErrors[key] = ''
  }
}

function resetForm() {
  form.name = props.product?.name ?? ''
  form.description = props.product?.description ?? ''
  form.price = props.product ? String(props.product.price) : ''
  form.category = props.product?.category ?? 'camiseta'
  form.audience = props.product?.audience ?? 'feminino'
  form.sizes = [...(props.product?.sizes ?? [])]
  form.colors = props.product?.colors ?? ''
  form.active = props.product?.active ?? true
  imageFile.value = null
  imagePreview.value = ''
  removeImage.value = false
  loading.value = false
  formError.value = ''
  clearFieldErrors()
  if (fileInput.value) fileInput.value.value = ''
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
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
})

function toggleSize(size: ProductSize) {
  form.sizes = form.sizes.includes(size)
    ? form.sizes.filter((s) => s !== size)
    : PRODUCT_SIZES.filter((s) => s === size || form.sizes.includes(s))
}

function onImageChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
  imageFile.value = file
  imagePreview.value = file ? URL.createObjectURL(file) : ''
  removeImage.value = false
  fieldErrors.image = ''
}

function clearImage() {
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
  imageFile.value = null
  imagePreview.value = ''
  removeImage.value = true
  if (fileInput.value) fileInput.value.value = ''
}

function parseNumber(value: string): number {
  return Number(String(value).replace(',', '.'))
}

async function onSubmit() {
  if (!canSubmit.value) return

  clearFieldErrors()
  formError.value = ''

  const price = parseNumber(form.price)
  if (!Number.isFinite(price) || price < 0) {
    fieldErrors.price = 'Informe o preço da peça.'
    return
  }

  loading.value = true

  try {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price,
      category: form.category,
      audience: form.audience,
      sizes: form.sizes,
      colors: form.colors.trim() || null,
      active: form.active,
      image: imageFile.value,
      remove_image: removeImage.value && !imageFile.value,
    }

    const saved =
      isEdit.value && props.product
        ? await updateProduct(props.product.id, payload)
        : await createProduct(payload)

    emit('saved', saved)
    close()
  } catch (error) {
    if (error instanceof ApiError) {
      const details = error.details ?? {}
      fieldErrors.name = details.name?.[0] || ''
      fieldErrors.description = details.description?.[0] || ''
      fieldErrors.price = details.price?.[0] || ''
      fieldErrors.category = details.category?.[0] || ''
      fieldErrors.audience = details.audience?.[0] || ''
      fieldErrors.colors = details.colors?.[0] || ''
      fieldErrors.image = details.image?.[0] || ''
      fieldErrors.sizes =
        details.sizes?.[0] ||
        Object.entries(details).find(([key]) => key.startsWith('sizes.'))?.[1]?.[0] ||
        ''
      const hasFieldError = Object.values(fieldErrors).some(Boolean)
      if (!hasFieldError) {
        formError.value = error.message || 'Não foi possível salvar a peça.'
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
        class="flex max-h-[min(90vh,820px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-brand-ink/10 bg-white shadow-2xl"
        @click.stop
      >
        <header
          class="flex shrink-0 items-start justify-between gap-3 border-b border-brand-ink/10 px-5 pt-5 pb-4"
        >
          <div class="min-w-0">
            <p
              class="mb-1 text-[0.65rem] font-medium tracking-[0.22em] text-brand-cyan-ink uppercase"
            >
              Produtos
            </p>
            <h2 id="product-form-title" class="text-xl font-semibold tracking-tight text-brand-ink">
              {{ isEdit ? 'Editar peça' : 'Nova peça' }}
            </h2>
          </div>
          <button
            type="button"
            class="inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-brand-ink/55 transition hover:bg-[#f4f6f8] hover:text-brand-ink"
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
            <span class="text-sm font-medium text-brand-ink/80">Foto</span>
            <div
              class="flex items-center gap-3 rounded-2xl border border-dashed border-brand-ink/20 bg-[#f8fafb] p-3"
            >
              <div
                class="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-ink/5"
              >
                <img
                  v-if="currentImageUrl"
                  :src="currentImageUrl"
                  alt=""
                  class="size-full object-cover"
                />
                <Icon
                  v-else
                  icon="lucide:shirt"
                  class="size-6 text-brand-ink/35"
                  aria-hidden="true"
                />
              </div>
              <div class="min-w-0 flex-1">
                <input
                  ref="fileInput"
                  type="file"
                  accept="image/*"
                  class="block w-full text-sm text-brand-ink/70 file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-brand-cyan/20 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-ink"
                  @change="onImageChange"
                />
                <button
                  v-if="currentImageUrl"
                  type="button"
                  class="mt-1 cursor-pointer text-xs font-medium text-brand-ink/55 hover:text-red-700"
                  @click="clearImage"
                >
                  Remover foto
                </button>
              </div>
            </div>
            <span v-if="fieldErrors.image" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.image }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Nome</span>
            <input
              v-model="form.name"
              type="text"
              required
              maxlength="190"
              placeholder="Ex.: Vestido floral midi"
              :class="inputClass"
            />
            <span v-if="fieldErrors.name" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.name }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Preço</span>
            <input
              v-model="form.price"
              type="text"
              inputmode="decimal"
              required
              placeholder="Ex.: 189,90"
              :class="inputClass"
            />
            <span v-if="fieldErrors.price" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.price }}
            </span>
          </label>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-brand-ink/80">Categoria</span>
              <select v-model="form.category" :class="inputClass">
                <option
                  v-for="(label, value) in PRODUCT_CATEGORY_LABELS"
                  :key="value"
                  :value="value"
                >
                  {{ label }}
                </option>
              </select>
              <span v-if="fieldErrors.category" class="text-sm text-brand-ink/70" role="alert">
                {{ fieldErrors.category }}
              </span>
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-brand-ink/80">Público</span>
              <select v-model="form.audience" :class="inputClass">
                <option
                  v-for="(label, value) in PRODUCT_AUDIENCE_LABELS"
                  :key="value"
                  :value="value"
                >
                  {{ label }}
                </option>
              </select>
              <span v-if="fieldErrors.audience" class="text-sm text-brand-ink/70" role="alert">
                {{ fieldErrors.audience }}
              </span>
            </label>
          </div>

          <fieldset class="flex flex-col gap-1.5">
            <legend class="mb-1.5 text-sm font-medium text-brand-ink/80">
              Tamanhos disponíveis
            </legend>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="size in PRODUCT_SIZES"
                :key="size"
                type="button"
                class="min-w-11 cursor-pointer rounded-lg border px-2.5 py-1.5 text-sm font-medium transition"
                :class="
                  form.sizes.includes(size)
                    ? 'border-brand-cyan bg-brand-cyan/15 text-brand-ink'
                    : 'border-brand-ink/15 bg-white text-brand-ink/60 hover:border-brand-ink/25'
                "
                :aria-pressed="form.sizes.includes(size)"
                @click="toggleSize(size)"
              >
                {{ productSizeLabel(size) }}
              </button>
            </div>
            <span v-if="fieldErrors.sizes" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.sizes }}
            </span>
          </fieldset>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">
              Cores <span class="font-normal text-brand-ink/45">(opcional)</span>
            </span>
            <input
              v-model="form.colors"
              type="text"
              maxlength="255"
              placeholder="Ex.: Preto, off-white, azul marinho"
              :class="inputClass"
            />
            <span v-if="fieldErrors.colors" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.colors }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">
              Descrição <span class="font-normal text-brand-ink/45">(opcional)</span>
            </span>
            <textarea
              v-model="form.description"
              rows="3"
              maxlength="2000"
              placeholder="Ex.: Viscose leve, caimento soltinho, forro até o joelho."
              :class="[inputClass, 'resize-y leading-relaxed']"
            />
            <span class="text-xs text-brand-ink/45">
              A IA usa este texto para tirar dúvidas sobre tecido, caimento e cuidados.
            </span>
            <span v-if="fieldErrors.description" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.description }}
            </span>
          </label>

          <label class="flex cursor-pointer items-center gap-2.5 text-sm text-brand-ink/80">
            <input
              v-model="form.active"
              type="checkbox"
              class="size-4 rounded border-brand-ink/30 accent-brand-cyan"
            />
            Ativo (visível para a IA)
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
              {{ isEdit ? 'Salvar' : 'Cadastrar' }}
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
