import { api, toApiError } from '@/api/client'
import type { LeadsPorDiaPoint } from '@/api/crm/types'

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
