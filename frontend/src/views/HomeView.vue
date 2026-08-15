<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '@/api/client'
import { listContacts } from '@/api/crm/contacts'
import { listLeads } from '@/api/crm/leads'
import { getPipeline } from '@/api/crm/pipeline'
import {
  getAttendanceStats,
  getLeadsPorDia,
  type AttendanceStats,
} from '@/api/crm/stats'
import type { LeadsPorDiaPoint, PipelineStage } from '@/api/crm/types'
import PageView from '@/components/Layout/PageView.vue'
import Button from '@/components/Buttons/Button.vue'
import CrmDashboardPanel from '@/components/crm/CrmDashboardPanel.vue'
import { useAuthStore } from '@/stores/auth'
import { useClinicsStore } from '@/stores/clinics'

const auth = useAuthStore()
const clinics = useClinicsStore()

const greetingName = computed(() => auth.user?.name || auth.user?.username || 'usuário')
const roleLabel = computed(() =>
  auth.user?.role === 'admin' ? 'Administrador' : 'Funcionário',
)

const loading = ref(true)
const error = ref('')
const contactTotal = ref(0)
const convertedTotal = ref(0)
const leadStages = ref<PipelineStage[]>([])
const dealStages = ref<PipelineStage[]>([])
const leadsPorDia = ref<LeadsPorDiaPoint[]>([])
const attendance = ref<AttendanceStats | null>(null)

async function loadDashboard() {
  if (!auth.isAdmin) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    const [contactsPage, pipelineDeal, pipelineLead, serie, converted, attendanceStats] =
      await Promise.all([
        listContacts(),
        getPipeline({ kind: 'deal' }),
        getPipeline({ kind: 'lead' }),
        getLeadsPorDia(30),
        listLeads({ status: 'converted' }),
        getAttendanceStats(30),
      ])
    contactTotal.value = contactsPage.total
    dealStages.value = pipelineDeal
    leadStages.value = pipelineLead
    leadsPorDia.value = serie.data
    convertedTotal.value = converted.total
    attendance.value = attendanceStats
  } catch (e) {
    error.value =
      e instanceof ApiError ? e.message : 'Não foi possível carregar o painel.'
  } finally {
    loading.value = false
  }
}

watch(
  () => clinics.activeClinicId,
  () => {
    void loadDashboard()
  },
)

onMounted(() => {
  void loadDashboard()
})
</script>

<template>
  <PageView title="Início">
    <template v-if="auth.isAdmin" #actions>
      <Button variant="secondary" icon="lucide:refresh-cw" @click="loadDashboard">
        Atualizar
      </Button>
    </template>

    <CrmDashboardPanel
      v-if="auth.isAdmin"
      :loading="loading"
      :error="error"
      :contact-total="contactTotal"
      :lead-stages="leadStages"
      :deal-stages="dealStages"
      :converted-total="convertedTotal"
      :leads-por-dia="leadsPorDia"
      :attendance="attendance"
    />

    <div v-else class="max-w-2xl">
      <p class="text-xl font-semibold tracking-tight text-brand-ink">
        Olá, {{ greetingName }}
      </p>
      <p class="mt-2 text-base leading-relaxed text-brand-ink/70">
        Bem-vindo ao painel da clínica. Use o menu lateral para navegar entre as seções.
      </p>
      <p class="mt-3 text-sm text-brand-ink/50">Perfil: {{ roleLabel }}</p>
    </div>
  </PageView>
</template>
