import { api, toApiError } from '@/api/client'
import type { DataResponse } from '@/api/crm/types'

export type ClinicService = {
  id: number
  clinic_id: number
  code: string
  name: string
  duration_minutes: number
  price_particular_min: string | number
  price_particular_max: string | number
  accepts_insurance: boolean
  description: string | null
  created_at: string
  updated_at: string
}

export type CreateClinicServicePayload = {
  code: string
  name: string
  duration_minutes: number
  price_particular_min: number
  price_particular_max: number
  accepts_insurance?: boolean
  description?: string | null
}

export type UpdateClinicServicePayload = {
  code?: string
  name?: string
  duration_minutes?: number
  price_particular_min?: number
  price_particular_max?: number
  accepts_insurance?: boolean
  description?: string | null
}

type ServicesListResponse = {
  data: ClinicService[]
}

export async function listServices(params?: { q?: string }): Promise<ClinicService[]> {
  try {
    const { data } = await api.get<ServicesListResponse>('/v1/crm/services', {
      params: params?.q ? { q: params.q } : undefined,
    })
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function createService(payload: CreateClinicServicePayload): Promise<ClinicService> {
  try {
    const { data } = await api.post<DataResponse<ClinicService>>('/v1/crm/services', payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function updateService(
  id: number,
  payload: UpdateClinicServicePayload,
): Promise<ClinicService> {
  try {
    const { data } = await api.patch<DataResponse<ClinicService>>(
      `/v1/crm/services/${id}`,
      payload,
    )
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function deleteService(id: number): Promise<void> {
  try {
    await api.delete(`/v1/crm/services/${id}`)
  } catch (error) {
    throw toApiError(error)
  }
}
