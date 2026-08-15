import { api, toApiError } from '@/api/client'
import type { Activity, CreateActivityPayload, DataResponse, Paginated } from '@/api/crm/types'

export async function listActivities(params?: {
  lead_id?: number
  deal_id?: number
  contact_id?: number
  type?: string
}): Promise<Paginated<Activity>> {
  try {
    const { data } = await api.get<Paginated<Activity>>('/v1/crm/activities', { params })
    return data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function createActivity(payload: CreateActivityPayload): Promise<Activity> {
  try {
    const { data } = await api.post<DataResponse<Activity>>('/v1/crm/activities', payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}
