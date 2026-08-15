import { api, toApiError } from '@/api/client'

export type Clinic = {
  id: number
  name: string
  slug: string
  is_active: boolean
}

type ClinicsResponse = {
  data: Clinic[]
}

type ClinicResponse = {
  data: Clinic
}

export async function listClinics(params?: { active?: boolean }): Promise<Clinic[]> {
  try {
    const { data } = await api.get<ClinicsResponse>('/v1/clinics', {
      params: params?.active ? { active: 1 } : undefined,
    })
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function createClinic(payload: {
  name: string
  slug?: string
  is_active?: boolean
}): Promise<Clinic> {
  try {
    const { data } = await api.post<ClinicResponse>('/v1/clinics', payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function updateClinic(
  id: number,
  payload: Partial<{ name: string; slug: string; is_active: boolean }>,
): Promise<Clinic> {
  try {
    const { data } = await api.patch<ClinicResponse>(`/v1/clinics/${id}`, payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}
