<script setup lang="ts">
defineOptions({ inheritAttrs: false })
</script>

<template>
  <div
    class="skeleton animate-pulse bg-brand-ink/[0.07]"
    v-bind="$attrs"
    aria-hidden="true"
  />
</template>
