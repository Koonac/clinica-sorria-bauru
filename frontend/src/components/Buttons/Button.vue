<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { Icon } from '@iconify/vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
    size?: 'sm' | 'md' | 'lg'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
    icon?: string
    block?: boolean
  }>(),
  {
    variant: 'primary',
    size: 'md',
    type: 'button',
    disabled: false,
    loading: false,
    icon: undefined,
    block: false,
  },
)

const attrs = useAttrs()

const isDisabled = computed(() => props.disabled || props.loading)

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'gap-1.5 px-4 py-2 text-sm'
    case 'lg':
      return 'gap-2.5 px-6 py-3.5 text-base'
    default:
      return 'gap-2 px-5 py-3 text-sm'
  }
})

const variantClass = computed(() => {
  switch (props.variant) {
    case 'secondary':
      return 'border border-brand-ink/15 bg-white font-medium text-brand-ink/70 hover:border-brand-ink/25 hover:bg-[#f4f6f8] hover:text-brand-ink'
    case 'danger':
      return 'bg-red-600 font-semibold text-white hover:bg-red-700'
    case 'ghost':
      return 'border border-brand-ink/10 bg-transparent font-medium text-brand-ink/65 hover:border-brand-ink/20 hover:bg-[#f4f6f8] hover:text-brand-ink'
    default:
      return 'bg-brand-cyan font-semibold text-brand-ink hover:-translate-y-px hover:brightness-105'
  }
})

const rootClass = computed(() => [
  'inline-flex cursor-pointer items-center justify-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0',
  sizeClass.value,
  variantClass.value,
  props.block ? 'w-full' : '',
  attrs.class,
])
</script>

<template>
  <button
    :type="type"
    :disabled="isDisabled"
    :class="rootClass"
    v-bind="Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class'))"
  >
    <Icon
      v-if="loading"
      icon="lucide:loader-circle"
      class="size-[18px] shrink-0 animate-spin"
      aria-hidden="true"
    />
    <Icon
      v-else-if="icon"
      :icon="icon"
      class="size-[18px] shrink-0"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
