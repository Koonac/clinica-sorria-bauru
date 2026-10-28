<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
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
const testPhone = ref<string | null>(null)

const isConnected = computed(() => status.value === 'connected')

async function checkConnection() {
  loading.value = true
  errorMessage.value = ''
  try {
    const conn = await getConnection()
    status.value = conn.status
    testPhone.value = conn.agent_test_phone
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

    <p
      v-if="testPhone && !loading"
      class="flex shrink-0 items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm leading-snug text-amber-900"
      role="status"
    >
      <Icon icon="lucide:flask-conical" class="size-4 shrink-0" aria-hidden="true" />
      <span>
        <strong class="font-semibold">Modo de teste ativo:</strong> a IA só responde ao número
        {{ testPhone }}. Os demais pacientes ficam sem resposta automática. Desative em
        Configurações › WhatsApp.
      </span>
    </p>

    <ContentSkeleton v-if="loading" variant="cards" />
    <WhatsappConnectionPanel
      v-else-if="!isConnected"
      @status-change="onStatusChange"
    />
    <WhatsappInbox v-else />
  </PageView>
</template>
