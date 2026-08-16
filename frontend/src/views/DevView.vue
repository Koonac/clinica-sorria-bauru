<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import { getTokenUsageStats, type TokenUsageStats } from '@/api/dev'
import Button from '@/components/Buttons/Button.vue'
import PageView from '@/components/Layout/PageView.vue'
import DevConfigPanel from '@/components/dev/DevConfigPanel.vue'
import DevLogsPanel from '@/components/dev/DevLogsPanel.vue'
import DevTokensPanel from '@/components/dev/DevTokensPanel.vue'

type DevTab = 'tokens' | 'logs' | 'config'

const route = useRoute()
const router = useRouter()

const tabs: { id: DevTab; label: string; icon: string }[] = [
  { id: 'tokens', label: 'Tokens', icon: 'lucide:gauge' },
  { id: 'logs', label: 'Logs', icon: 'lucide:scroll-text' },
  { id: 'config', label: 'Configuração', icon: 'lucide:sliders-horizontal' },
]

const tab = computed<DevTab>({
  get() {
    const q = String(route.query.tab || 'tokens')
    if (q === 'tokens' || q === 'logs' || q === 'config') return q
    return 'tokens'
  },
  set(value) {
    void router.replace({ query: { ...route.query, tab: value } })
  },
})

const tokensLoading = ref(true)
const tokensError = ref('')
const tokenStats = ref<TokenUsageStats | null>(null)

async function loadTokens() {
  tokensLoading.value = true
  tokensError.value = ''
  try {
    tokenStats.value = await getTokenUsageStats(30)
  } catch (e) {
    tokensError.value =
      e instanceof ApiError ? e.message : 'Não foi possível carregar o consumo de tokens.'
    tokenStats.value = null
  } finally {
    tokensLoading.value = false
  }
}

watch(tab, (next) => {
  if (next === 'tokens' && !tokenStats.value && !tokensLoading.value) {
    void loadTokens()
  }
})

onMounted(() => {
  if (tab.value === 'tokens') void loadTokens()
})
</script>

<template>
  <PageView title="Dev">
    <template v-if="tab === 'tokens'" #actions>
      <Button variant="secondary" icon="lucide:refresh-cw" @click="loadTokens">
        Atualizar
      </Button>
    </template>

    <div class="flex shrink-0 flex-wrap gap-2">
      <button
        v-for="item in tabs"
        :key="item.id"
        type="button"
        class="cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition"
        :class="
          tab === item.id
            ? 'bg-brand-cyan text-brand-ink'
            : 'border border-brand-ink/15 text-brand-ink/70 hover:border-brand-ink/25 hover:text-brand-ink'
        "
        @click="tab = item.id"
      >
        {{ item.label }}
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <DevTokensPanel
        v-if="tab === 'tokens'"
        :loading="tokensLoading"
        :error="tokensError"
        :stats="tokenStats"
      />
      <DevLogsPanel v-else-if="tab === 'logs'" />
      <DevConfigPanel v-else />
    </div>
  </PageView>
</template>
