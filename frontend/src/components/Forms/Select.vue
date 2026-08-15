<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'

export type SelectOption = {
  value: string | number
  label: string
  disabled?: boolean
}

const NONE = '__none__'

const model = defineModel<string | number | null>({ default: null })

const props = withDefaults(
  defineProps<{
    options: SelectOption[]
    placeholder?: string
    disabled?: boolean
    required?: boolean
    name?: string
    id?: string
    /** Valor emitido quando a opção “vazia” (value '') é escolhida. */
    emptyValue?: string | number | null
  }>(),
  {
    placeholder: 'Selecione…',
    disabled: false,
    required: false,
    name: undefined,
    id: undefined,
    emptyValue: '',
  },
)

const internalValue = computed<string>({
  get() {
    const v = model.value
    if (v === '' || v === null || v === undefined) return NONE
    return String(v)
  },
  set(next) {
    if (next === NONE || next === '') {
      model.value = props.emptyValue
      return
    }
    const match = props.options.find((o) => String(o.value) === next)
    model.value = match ? match.value : next
  },
})

function itemValue(option: SelectOption): string {
  if (option.value === '' || option.value === null || option.value === undefined) return NONE
  return String(option.value)
}
</script>

<template>
  <SelectRoot
    v-model="internalValue"
    :disabled="disabled"
    :required="required"
    :name="name"
  >
    <SelectTrigger
      :id="id"
      class="group flex w-full items-center justify-between gap-2 rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-left text-sm text-brand-ink outline-none transition focus-visible:border-brand-cyan focus-visible:ring-2 focus-visible:ring-brand-cyan/25 disabled:cursor-not-allowed disabled:opacity-55 data-[placeholder]:text-brand-ink/35"
      :aria-required="required || undefined"
    >
      <SelectValue :placeholder="placeholder" class="min-w-0 flex-1 truncate" />
      <SelectIcon class="shrink-0 text-brand-ink/40 transition group-data-[state=open]:rotate-180">
        <Icon icon="lucide:chevron-down" class="size-4" aria-hidden="true" />
      </SelectIcon>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        position="popper"
        :side-offset="6"
        class="z-[80] max-h-72 w-[var(--reka-select-trigger-width)] overflow-hidden rounded-xl border border-brand-ink/10 bg-white shadow-lg outline-none data-[state=open]:animate-fade-up"
      >
        <SelectScrollUpButton
          class="flex cursor-default items-center justify-center py-1 text-brand-ink/40"
        >
          <Icon icon="lucide:chevron-up" class="size-4" aria-hidden="true" />
        </SelectScrollUpButton>

        <SelectViewport class="p-1">
          <SelectItem
            v-for="option in options"
            :key="itemValue(option)"
            :value="itemValue(option)"
            :disabled="option.disabled"
            class="relative flex cursor-pointer items-center rounded-lg py-2 pr-8 pl-3 text-sm text-brand-ink outline-none select-none data-[disabled]:pointer-events-none data-[highlighted]:bg-[#f4f6f8] data-[disabled]:opacity-40"
          >
            <SelectItemText class="truncate">
              {{ option.label }}
            </SelectItemText>
            <SelectItemIndicator
              class="absolute right-2 inline-flex items-center text-brand-cyan-ink"
            >
              <Icon icon="lucide:check" class="size-4" aria-hidden="true" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>

        <SelectScrollDownButton
          class="flex cursor-default items-center justify-center py-1 text-brand-ink/40"
        >
          <Icon icon="lucide:chevron-down" class="size-4" aria-hidden="true" />
        </SelectScrollDownButton>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
