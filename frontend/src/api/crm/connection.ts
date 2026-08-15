import { api, toApiError } from '@/api/client'
import type { DataResponse } from '@/api/crm/types'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export type ClinicConnection = {
  id: number
  clinic_id: number
  name: string | null
  ai_display_name: string | null
  status: ConnectionStatus
  phone: string | null
  is_business: boolean
  has_credentials: boolean
  session_id: string | null
  default_lead_stage_id: number | null
  whatsapp_agent_auto_resume_hours: number
  whatsapp_attendance_auto_close_minutes: number
  api_username: string | null
  has_qr?: boolean
}

export type ConnectionQr = {
  session_id: string | null
  qr: string | null
  source: string
}

export async function getConnection(): Promise<ClinicConnection> {
  try {
    const { data } = await api.get<DataResponse<ClinicConnection>>('/v1/crm/connection')
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function updateConnectionCredentials(payload: {
  api_username: string
  api_password: string
}): Promise<ClinicConnection> {
  try {
    const { data } = await api.put<DataResponse<ClinicConnection>>(
      '/v1/crm/connection/credentials',
      payload,
    )
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function updateConnectionSettings(payload: {
  name?: string | null
  ai_display_name?: string | null
  default_lead_stage_id?: number | null
  whatsapp_agent_auto_resume_hours?: number
  whatsapp_attendance_auto_close_minutes?: number
}): Promise<ClinicConnection> {
  try {
    const { data } = await api.put<DataResponse<ClinicConnection>>(
      '/v1/crm/connection/settings',
      payload,
    )
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function connectWhatsapp(): Promise<{ data: ClinicConnection; message?: string }> {
  try {
    const { data } = await api.post<{ data: ClinicConnection; message?: string }>(
      '/v1/crm/connection/connect',
    )
    return data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function getConnectionQr(): Promise<ConnectionQr> {
  try {
    const { data } = await api.get<DataResponse<ConnectionQr>>('/v1/crm/connection/qrcode')
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function getConnectionStatus(): Promise<ClinicConnection> {
  try {
    const { data } = await api.get<DataResponse<ClinicConnection>>('/v1/crm/connection/status')
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function disconnectWhatsapp(): Promise<ClinicConnection> {
  try {
    const { data } = await api.delete<DataResponse<ClinicConnection>>(
      '/v1/crm/connection/disconnect',
    )
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}
