<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import PageView from '@/components/Layout/PageView.vue'

const route = useRoute()

const title = computed(() => {
  const metaTitle = route.meta.title
  return typeof metaTitle === 'string' && metaTitle.length > 0 ? metaTitle : 'Página'
})

const icon = computed(() => {
  const metaIcon = route.meta.icon
  return typeof metaIcon === 'string' && metaIcon.length > 0 ? metaIcon : 'lucide:layout'
})
</script>

<template>
  <PageView :title="title">
    <div class="max-w-xl">
      <div
        class="inline-flex size-12 items-center justify-center rounded-2xl border border-brand-ink/10 bg-white text-brand-cyan-ink"
      >
        <Icon :icon="icon" class="size-6" aria-hidden="true" />
      </div>
      <p class="mt-4 text-base leading-relaxed text-brand-ink/70">
        Esta seção ainda está em construção. Em breve você poderá usá-la por aqui.
      </p>
    </div>
  </PageView>
</template>
