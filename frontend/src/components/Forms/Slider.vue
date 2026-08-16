<script setup lang="ts">
import { computed } from 'vue'
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui'

const model = defineModel<number>({ required: true })

const props = withDefaults(
  defineProps<{
    min?: number
    max?: number
    step?: number
    disabled?: boolean
    name?: string
    id?: string
    ariaLabel?: string
  }>(),
  {
    min: 0,
    max: 100,
    step: 1,
    disabled: false,
    name: undefined,
    id: undefined,
    ariaLabel: undefined,
  },
)

const internalValue = computed<number[]>({
  get() {
    const n = Number(model.value)
    if (!Number.isFinite(n)) return [props.min]
    return [Math.min(props.max, Math.max(props.min, n))]
  },
  set(next) {
    const raw = Array.isArray(next) ? next[0] : next
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    model.value = Math.min(props.max, Math.max(props.min, Math.round(n)))
  },
})
</script>

<template>
  <SliderRoot
    v-model="internalValue"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :name="name"
    class="relative flex w-full touch-none items-center select-none data-[disabled]:opacity-55"
  >
    <SliderTrack
      class="relative h-2 grow overflow-hidden rounded-full bg-brand-ink/[0.08]"
    >
      <SliderRange class="absolute h-full rounded-full bg-brand-blue" />
    </SliderTrack>
    <SliderThumb
      :id="id"
      :aria-label="ariaLabel"
      class="block size-5 rounded-full border-2 border-white bg-brand-blue shadow-md outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-brand-cyan/40 focus-visible:ring-offset-2"
    />
  </SliderRoot>
</template>
