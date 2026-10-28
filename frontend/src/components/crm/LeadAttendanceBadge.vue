<script setup lang="ts">
import { computed } from 'vue'
import type { LeadAttendanceStatus } from '@/api/crm/types'
import { attendanceLabel, attendanceTone } from '@/utils/leadAttendance'

const props = defineProps<{
  status?: LeadAttendanceStatus | null
}>()

const label = computed(() => attendanceLabel(props.status))
const tone = computed(() => attendanceTone(props.status))
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-4"
    :class="tone"
    :title="`Status de atendimento: ${label}`"
  >
    {{ label }}
  </span>
</template>
