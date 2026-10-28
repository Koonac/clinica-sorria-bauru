import type { LeadAttendanceStatus } from '@/api/crm/types'
import type { AppointmentStatus } from '@/api/crm/appointments'

export const LEAD_ATTENDANCE_OPTIONS: { value: LeadAttendanceStatus; label: string }[] = [
  { value: 'novo', label: 'Novo' },
  { value: 'em_atendimento', label: 'Em atendimento' },
  { value: 'humano', label: 'Com humano' },
  { value: 'pre_agendado', label: 'Pré-agendado' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'sem_resposta', label: 'Sem resposta' },
]

const ATTENDANCE_TONE: Record<LeadAttendanceStatus, string> = {
  novo: 'bg-brand-blue/10 text-brand-blue',
  em_atendimento: 'bg-brand-cyan/15 text-brand-cyan-ink',
  humano: 'bg-amber-500/15 text-amber-800',
  pre_agendado: 'bg-violet-500/15 text-violet-700',
  agendado: 'bg-emerald-50 text-emerald-700',
  sem_resposta: 'bg-brand-ink/10 text-brand-ink/70',
}

export function attendanceLabel(status?: LeadAttendanceStatus | null): string {
  return LEAD_ATTENDANCE_OPTIONS.find((o) => o.value === status)?.label ?? 'Novo'
}

export function attendanceTone(status?: LeadAttendanceStatus | null): string {
  return ATTENDANCE_TONE[status ?? 'novo'] ?? ATTENDANCE_TONE.novo
}

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  pre_agendado: 'Pré-agendamento',
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  realizado: 'Realizado',
  faltou: 'Faltou',
}

export const APPOINTMENT_STATUS_TONE: Record<AppointmentStatus, string> = {
  pre_agendado: 'bg-violet-500/15 text-violet-700',
  agendado: 'bg-brand-cyan/15 text-brand-cyan-ink',
  confirmado: 'bg-emerald-50 text-emerald-700',
  cancelado: 'bg-brand-ink/10 text-brand-ink/60',
  realizado: 'bg-emerald-100 text-emerald-800',
  faltou: 'bg-red-50 text-red-700',
}
