<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '@/api/client'
import { getConnection, type ConnectionStatus } from '@/api/crm/connection'
import ContentSkeleton from '@/components/Feedback/ContentSkeleton.vue'
import PageView from '@/components/Layout/PageView.vue'
import WhatsappConnectionPanel from '@/components/whatsapp/WhatsappConnectionPanel.vue'
import WhatsappInbox from '@/components/whatsapp/WhatsappInbox.vue'
import { useClinicsStore } from '@/stores/clinics'

const clinics = useClinicsStore()

const loading = ref(true)
const errorMessage = ref('')
const status = ref<ConnectionStatus | null>(null)

const isConnected = computed(() => status.value === 'connected')

async function checkConnection() {
  loading.value = true
  errorMessage.value = ''
  try {
    const conn = await getConnection()
    status.value = conn.status
  } catch (error) {
    status.value = null
    errorMessage.value =
      error instanceof ApiError
        ? error.message || 'Não foi possível verificar a conexão WhatsApp.'
        : 'Servidor indisponível. Tente novamente.'
  } finally {
    loading.value = false
  }
}

function onStatusChange(next: ConnectionStatus) {
  status.value = next
}

watch(
  () => clinics.activeClinicId,
  () => {
    void checkConnection()
  },
)

onMounted(() => {
  void checkConnection()
})
</script>

<template>
  <PageView title="WhatsApp">
    <p
      v-if="errorMessage && !loading"
      class="shrink-0 rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <ContentSkeleton v-if="loading" variant="cards" />
    <WhatsappConnectionPanel
      v-else-if="!isConnected"
      @status-change="onStatusChange"
    />
    <WhatsappInbox v-else />
  </PageView>
</template>
