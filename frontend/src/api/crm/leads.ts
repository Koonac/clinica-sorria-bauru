import { api, toApiError } from '@/api/client'
import type {
  ConvertLeadPayload,
  CreateLeadPayload,
  DataResponse,
  Lead,
  MoveLeadPayload,
  Paginated,
  UpdateLeadPayload,
} from '@/api/crm/types'

export async function listLeads(params?: {
  status?: string
  search?: string
}): Promise<Paginated<Lead>> {
  try {
    const { data } = await api.get<Paginated<Lead>>('/v1/crm/leads', { params })
    return data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function getLead(id: number): Promise<Lead> {
  try {
    const { data } = await api.get<DataResponse<Lead>>(`/v1/crm/leads/${id}`)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function createLead(payload: CreateLeadPayload): Promise<Lead> {
  try {
    const { data } = await api.post<DataResponse<Lead>>('/v1/crm/leads', payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function updateLead(id: number, payload: UpdateLeadPayload): Promise<Lead> {
  try {
    const { data } = await api.patch<DataResponse<Lead>>(`/v1/crm/leads/${id}`, payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function deleteLead(id: number): Promise<void> {
  try {
    await api.delete(`/v1/crm/leads/${id}`)
  } catch (error) {
    throw toApiError(error)
  }
}

export async function moveLead(id: number, payload: MoveLeadPayload): Promise<Lead> {
  try {
    const { data } = await api.post<DataResponse<Lead>>(`/v1/crm/leads/${id}/move`, payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function convertLead(
  id: number,
  payload: ConvertLeadPayload = {},
): Promise<import('@/api/crm/types').Deal> {
  try {
    const { data } = await api.post<DataResponse<import('@/api/crm/types').Deal>>(
      `/v1/crm/leads/${id}/convert`,
      payload,
    )
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function pauseLeadAgent(id: number): Promise<Lead> {
  try {
    const { data } = await api.post<DataResponse<Lead>>(`/v1/crm/leads/${id}/agent/pause`)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function resumeLeadAgent(id: number): Promise<Lead> {
  try {
    const { data } = await api.post<DataResponse<Lead>>(`/v1/crm/leads/${id}/agent/resume`)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}
