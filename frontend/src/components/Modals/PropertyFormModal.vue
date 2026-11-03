<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import {
  createProperty,
  updateProperty,
  PROPERTY_DEAL_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  type ClinicProperty,
  type PropertyDealType,
  type PropertyType,
} from '@/api/crm/properties'
import Button from '@/components/Buttons/Button.vue'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  property: ClinicProperty | null
}>()

const emit = defineEmits<{
  saved: [property: ClinicProperty]
}>()

const inputClass =
  'w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25'

const isEdit = computed(() => Boolean(props.property))

const form = reactive({
  title: '',
  address: '',
  price: '',
  deal_type: 'compra' as PropertyDealType,
  property_type: 'apartamento' as PropertyType,
  active: true,
})

const fieldErrors = reactive({
  title: '',
  address: '',
  price: '',
  deal_type: '',
  property_type: '',
  image: '',
})

const imageFile = ref<File | null>(null)
const imagePreview = ref('')
const removeImage = ref(false)
const loading = ref(false)
const formError = ref('')
const panelRef = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const canSubmit = computed(() => {
  if (loading.value) return false
  if (!form.address.trim() || !form.price) return false
  return true
})

const currentImageUrl = computed(() => {
  if (imagePreview.value) return imagePreview.value
  if (removeImage.value) return ''
  return props.property?.image_url || ''
})

function clearFieldErrors() {
  fieldErrors.title = ''
  fieldErrors.address = ''
  fieldErrors.price = ''
  fieldErrors.deal_type = ''
  fieldErrors.property_type = ''
  fieldErrors.image = ''
}

function resetForm() {
  form.title = props.property?.title ?? ''
  form.address = props.property?.address ?? ''
  form.price = props.property ? String(props.property.price) : ''
  form.deal_type = props.property?.deal_type ?? 'compra'
  form.property_type = props.property?.property_type ?? 'apartamento'
  form.active = props.property?.active ?? true
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
    fieldErrors.price = 'Informe o valor do imóvel.'
    return
  }

  loading.value = true

  try {
    const payload = {
      title: form.title.trim() || null,
      address: form.address.trim(),
      price,
      deal_type: form.deal_type,
      property_type: form.property_type,
      active: form.active,
      image: imageFile.value,
      remove_image: removeImage.value && !imageFile.value,
    }

    const saved =
      isEdit.value && props.property
        ? await updateProperty(props.property.id, payload)
        : await createProperty(payload)

    emit('saved', saved)
    close()
  } catch (error) {
    if (error instanceof ApiError) {
      fieldErrors.title = error.details?.title?.[0] || ''
      fieldErrors.address = error.details?.address?.[0] || ''
      fieldErrors.price = error.details?.price?.[0] || ''
      fieldErrors.deal_type = error.details?.deal_type?.[0] || ''
      fieldErrors.property_type = error.details?.property_type?.[0] || ''
      fieldErrors.image = error.details?.image?.[0] || ''
      const hasFieldError = Object.values(fieldErrors).some(Boolean)
      if (!hasFieldError) {
        formError.value = error.message || 'Não foi possível salvar o imóvel.'
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
        aria-labelledby="property-form-title"
        class="flex max-h-[min(90vh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-brand-ink/10 bg-white shadow-2xl"
        @click.stop
      >
        <header
          class="flex shrink-0 items-start justify-between gap-3 border-b border-brand-ink/10 px-5 pt-5 pb-4"
        >
          <div class="min-w-0">
            <p class="mb-1 text-[0.65rem] font-medium tracking-[0.22em] text-brand-cyan-ink uppercase">
              Imóveis
            </p>
            <h2 id="property-form-title" class="text-xl font-semibold tracking-tight text-brand-ink">
              {{ isEdit ? 'Editar imóvel' : 'Novo imóvel' }}
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
            <span class="text-sm font-medium text-brand-ink/80">Imagem</span>
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
                <Icon v-else icon="lucide:image" class="size-6 text-brand-ink/35" aria-hidden="true" />
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
                  Remover imagem
                </button>
              </div>
            </div>
            <span v-if="fieldErrors.image" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.image }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">
              Título <span class="font-normal text-brand-ink/45">(opcional)</span>
            </span>
            <input
              v-model="form.title"
              type="text"
              maxlength="190"
              placeholder="Ex.: Apartamento 2 dormitórios"
              :class="inputClass"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Endereço</span>
            <input
              v-model="form.address"
              type="text"
              required
              maxlength="255"
              placeholder="Ex.: Rua das Flores, 100 – Centro"
              :class="inputClass"
            />
            <span v-if="fieldErrors.address" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.address }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Valor</span>
            <input
              v-model="form.price"
              type="text"
              inputmode="decimal"
              required
              placeholder="Ex.: 350000"
              :class="inputClass"
            />
            <span v-if="fieldErrors.price" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.price }}
            </span>
          </label>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-brand-ink/80">Negócio</span>
              <select v-model="form.deal_type" :class="inputClass">
                <option
                  v-for="(label, value) in PROPERTY_DEAL_TYPE_LABELS"
                  :key="value"
                  :value="value"
                >
                  {{ label }}
                </option>
              </select>
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-brand-ink/80">Tipo</span>
              <select v-model="form.property_type" :class="inputClass">
                <option v-for="(label, value) in PROPERTY_TYPE_LABELS" :key="value" :value="value">
                  {{ label }}
                </option>
              </select>
            </label>
          </div>

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
