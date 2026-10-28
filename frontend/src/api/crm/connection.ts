import { api, toApiError } from '@/api/client'
import type { DataResponse } from '@/api/crm/types'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

/** direct = IA marca na agenda; pre_booking = IA registra preferência e a recepção confirma. */
export type SchedulingMode = 'direct' | 'pre_booking'

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
  whatsapp_finalize_notice: string
  whatsapp_agent_history_limit: number
  reception_alert_jid: string | null
  scheduling_mode: SchedulingMode
  appointment_reminder_enabled: boolean
  appointment_reminder_hours: number
  appointment_reminder_template: string
  whatsapp_follow_up_enabled: boolean
  whatsapp_follow_up_delays: number[]
  whatsapp_send_window_start: number
  whatsapp_send_window_end: number
  api_username?: string | null
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
  whatsapp_finalize_notice?: string | null
  whatsapp_agent_history_limit?: number
  reception_alert_jid?: string | null
  scheduling_mode?: SchedulingMode
  appointment_reminder_enabled?: boolean
  appointment_reminder_hours?: number
  appointment_reminder_template?: string | null
  whatsapp_follow_up_enabled?: boolean
  whatsapp_follow_up_delays?: number[]
  whatsapp_send_window_start?: number
  whatsapp_send_window_end?: number
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
