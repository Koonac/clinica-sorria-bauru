import { api, toApiError } from '@/api/client'
import type { DataResponse, Source } from '@/api/crm/types'

export async function listSources(): Promise<Source[]> {
  try {
    const { data } = await api.get<DataResponse<Source[]>>('/v1/crm/sources')
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}
