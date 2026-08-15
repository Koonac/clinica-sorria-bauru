import { api, toApiError } from '@/api/client'
import type { CrmAttendant, DataResponse } from '@/api/crm/types'

export async function listAttendants(): Promise<CrmAttendant[]> {
  try {
    const { data } = await api.get<DataResponse<CrmAttendant[]>>('/v1/crm/attendants')
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}
