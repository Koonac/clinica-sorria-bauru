import { api, toApiError } from '@/api/client'
import type { BusinessHours } from '@/api/clinics'
import type { DataResponse } from '@/api/crm/types'

export type Agent = {
  id: number
  clinic_id: number | null
  user_id: number
  name: string
  system_prompt: string | null
  debounce_seconds: number
  is_active: boolean
  /** Null = atende 24 horas. */
  working_hours: BusinessHours | null
  created_at: string
  updated_at: string
}

export type CreateAgentPayload = {
  name: string
  system_prompt?: string | null
  debounce_seconds?: number
  is_active?: boolean
  working_hours?: BusinessHours | null
}

export type UpdateAgentPayload = {
  name?: string
  system_prompt?: string | null
  debounce_seconds?: number
  is_active?: boolean
  working_hours?: BusinessHours | null
}

type AgentsListResponse = {
  data: Agent[]
}

export async function listAgents(): Promise<Agent[]> {
  try {
    const { data } = await api.get<AgentsListResponse>('/v1/crm/agents')
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function getAgent(id: number): Promise<Agent> {
  try {
    const { data } = await api.get<DataResponse<Agent>>(`/v1/crm/agents/${id}`)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function createAgent(payload: CreateAgentPayload): Promise<Agent> {
  try {
    const { data } = await api.post<DataResponse<Agent>>('/v1/crm/agents', payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function updateAgent(id: number, payload: UpdateAgentPayload): Promise<Agent> {
  try {
    const { data } = await api.patch<DataResponse<Agent>>(`/v1/crm/agents/${id}`, payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function deleteAgent(id: number): Promise<void> {
  try {
    await api.delete(`/v1/crm/agents/${id}`)
  } catch (error) {
    throw toApiError(error)
  }
}

export async function activateAgent(id: number): Promise<Agent> {
  try {
    const { data } = await api.post<DataResponse<Agent>>(`/v1/crm/agents/${id}/activate`)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function deactivateAgent(id: number): Promise<Agent> {
  try {
    const { data } = await api.post<DataResponse<Agent>>(`/v1/crm/agents/${id}/deactivate`)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}
