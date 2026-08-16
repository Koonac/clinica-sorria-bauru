<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
} from 'reka-ui'
import type { SelectOption } from '@/components/Forms/Select.vue'

const model = defineModel<string | number | null>({ default: null })

const props = withDefaults(
  defineProps<{
    options: SelectOption[]
    placeholder?: string
    searchPlaceholder?: string
    emptyLabel?: string
    disabled?: boolean
    id?: string
  }>(),
  {
    placeholder: 'Selecione…',
    searchPlaceholder: 'Pesquisar…',
    emptyLabel: 'Nenhum resultado encontrado.',
    disabled: false,
    id: undefined,
  },
)

const internalValue = computed<string>({
  get() {
    const v = model.value
    return v === null || v === undefined ? '' : String(v)
  },
  set(next) {
    if (!next) {
      model.value = ''
      return
    }
    const match = props.options.find((o) => String(o.value) === next)
    model.value = match ? match.value : next
  },
})

const selectedLabel = computed(() => {
  const current = internalValue.value
  if (!current) return ''
  return props.options.find((o) => String(o.value) === current)?.label ?? current
})
</script>

<template>
  <ComboboxRoot v-model="internalValue" :disabled="disabled" open-on-click>
    <ComboboxAnchor as-child>
      <ComboboxTrigger
        :id="id"
        class="group flex w-full items-center justify-between gap-2 rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-left text-sm text-brand-ink outline-none transition focus-visible:border-brand-cyan focus-visible:ring-2 focus-visible:ring-brand-cyan/25 disabled:cursor-not-allowed disabled:opacity-55"
      >
        <span
          class="min-w-0 flex-1 truncate"
          :class="selectedLabel ? '' : 'text-brand-ink/35'"
        >
          {{ selectedLabel || placeholder }}
        </span>
        <Icon
          icon="lucide:chevron-down"
          class="size-4 shrink-0 text-brand-ink/40 transition group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </ComboboxTrigger>
    </ComboboxAnchor>

    <ComboboxPortal>
      <ComboboxContent
        position="popper"
        :side-offset="6"
        class="z-[80] w-[var(--reka-combobox-trigger-width)] overflow-hidden rounded-xl border border-brand-ink/10 bg-white shadow-lg outline-none data-[state=open]:animate-fade-up"
      >
        <div class="flex items-center gap-2 border-b border-brand-ink/10 px-3">
          <Icon icon="lucide:search" class="size-4 shrink-0 text-brand-ink/40" aria-hidden="true" />
          <ComboboxInput
            class="w-full bg-transparent py-2.5 text-sm text-brand-ink outline-none placeholder:text-brand-ink/35"
            :placeholder="searchPlaceholder"
            auto-focus
          />
        </div>

        <ComboboxViewport class="max-h-64 overflow-y-auto p-1">
          <ComboboxEmpty class="px-3 py-6 text-center text-sm text-brand-ink/50">
            {{ emptyLabel }}
          </ComboboxEmpty>

          <ComboboxItem
            v-for="option in options"
            :key="String(option.value)"
            :value="String(option.value)"
            :disabled="option.disabled"
            class="relative flex cursor-pointer items-center rounded-lg py-2 pr-8 pl-3 text-sm text-brand-ink outline-none select-none data-[disabled]:pointer-events-none data-[highlighted]:bg-[#f4f6f8] data-[disabled]:opacity-40"
          >
            <span class="truncate">{{ option.label }}</span>
            <ComboboxItemIndicator
              class="absolute right-2 inline-flex items-center text-brand-cyan-ink"
            >
              <Icon icon="lucide:check" class="size-4" aria-hidden="true" />
            </ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
