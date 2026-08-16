import { api, toApiError } from '@/api/client'
import type { LeadsPorDiaPoint } from '@/api/crm/types'

export type AttendanceStatsByUser = {
  user_id: number | null
  name: string
  mode: 'ai' | 'human'
  clients: number
  total_seconds: number
}

export type AttendanceStats = {
  dias: number
  clients_ai: number
  clients_human: number
  clients_total: number
  total_ai_seconds: number
  total_human_seconds: number
  avg_human_seconds: number | null
  open_ai: number
  open_human: number
  by_user: AttendanceStatsByUser[]
}

export async function getLeadsPorDia(dias = 30): Promise<{
  data: LeadsPorDiaPoint[]
  dias: number
  total: number
}> {
  try {
    const { data } = await api.get<{
      data: LeadsPorDiaPoint[]
      dias: number
      total: number
    }>('/v1/crm/stats/leads-por-dia', { params: { dias } })
    return data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function getAttendanceStats(dias = 30): Promise<AttendanceStats> {
  try {
    const { data } = await api.get<{ data: AttendanceStats }>('/v1/crm/stats/attendance', {
      params: { dias },
    })
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}
