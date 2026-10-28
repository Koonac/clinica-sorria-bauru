import { api, toApiError } from '@/api/client'

/** Dia ISO ('1' = segunda … '7' = domingo) → horário "HH:MM". Dias ausentes = fechado. */
export type BusinessHours = Partial<Record<'1' | '2' | '3' | '4' | '5' | '6' | '7', { start: string; end: string }>>

export type Clinic = {
  id: number
  name: string
  slug: string
  is_active: boolean
  business_hours?: BusinessHours
  appointment_slot_minutes?: number
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

export async function getClinic(id: number): Promise<Clinic> {
  try {
    const { data } = await api.get<ClinicResponse>(`/v1/clinics/${id}`)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function updateClinic(
  id: number,
  payload: Partial<{
    name: string
    slug: string
    is_active: boolean
    business_hours: BusinessHours
    google_calendar_slot_minutes: number
  }>,
): Promise<Clinic> {
  try {
    const { data } = await api.patch<ClinicResponse>(`/v1/clinics/${id}`, payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}
