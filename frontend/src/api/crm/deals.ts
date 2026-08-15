import { api, toApiError } from '@/api/client'
import type { DataResponse, Deal, Paginated, UpdateDealPayload } from '@/api/crm/types'

export async function listDeals(params?: {
  stage_id?: number
  search?: string
}): Promise<Paginated<Deal>> {
  try {
    const { data } = await api.get<Paginated<Deal>>('/v1/crm/deals', { params })
    return data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function getDeal(id: number): Promise<Deal> {
  try {
    const { data } = await api.get<DataResponse<Deal>>(`/v1/crm/deals/${id}`)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function updateDeal(id: number, payload: UpdateDealPayload): Promise<Deal> {
  try {
    const { data } = await api.patch<DataResponse<Deal>>(`/v1/crm/deals/${id}`, payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function deleteDeal(id: number): Promise<void> {
  try {
    await api.delete(`/v1/crm/deals/${id}`)
  } catch (error) {
    throw toApiError(error)
  }
}
