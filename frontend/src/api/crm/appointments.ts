import { api, toApiError } from '@/api/client'
import type { CrmUserRef, DataResponse, LeadAttendanceStatus, Paginated } from '@/api/crm/types'

export type AppointmentStatus =
  'pre_agendado' | 'agendado' | 'confirmado' | 'cancelado' | 'realizado' | 'faltou'

export type AppointmentView = 'pre_booking' | 'upcoming' | 'history'

export type Appointment = {
  id: number
  lead_id: number
  clinic_service_id: number | null
  status: AppointmentStatus
  source: 'ai' | 'manual'
  title: string | null
  preferred_text: string | null
  preferred_start_at: string | null
  starts_at: string | null
  ends_at: string | null
  notes: string | null
  task_id: number | null
  google_event_id: string | null
  google_html_link: string | null
  reminder_sent_at: string | null
  confirmed_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  created_at: string
  updated_at: string
  lead?: {
    id: number
    name: string
    mobile: string | null
    whatsapp_jid: string | null
    attendance_status?: LeadAttendanceStatus
  } | null
  service?: { id: number; name: string; duration_minutes: number } | null
  confirmed_by?: CrmUserRef | null
}

export type AppointmentScheduleMeta = {
  calendar_error: string | null
  patient_notified: boolean
  notify_error: string | null
}

export type ConfirmPreBookingPayload = {
  starts_at: string
  ends_at: string
  title?: string | null
  clinic_service_id?: number | null
  notes?: string | null
  notify_patient?: boolean
}

export type AvailableSlot = {
  inicio: string
  fim: string
  rotulo: string
}

export async function listAppointments(params: {
  view?: AppointmentView
  lead_id?: number
  search?: string
}): Promise<Paginated<Appointment>> {
  try {
    const { data } = await api.get<Paginated<Appointment>>('/v1/crm/appointments', { params })
    return data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function confirmPreBooking(
  id: number,
  payload: ConfirmPreBookingPayload,
): Promise<{ data: Appointment; meta: AppointmentScheduleMeta }> {
  try {
    const { data } = await api.post<{ data: Appointment; meta: AppointmentScheduleMeta }>(
      `/v1/crm/appointments/${id}/confirm`,
      payload,
    )
    return data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function cancelAppointment(id: number, reason?: string | null): Promise<Appointment> {
  try {
    const { data } = await api.post<DataResponse<Appointment>>(
      `/v1/crm/appointments/${id}/cancel`,
      {
        reason: reason || null,
      },
    )
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function setAppointmentOutcome(
  id: number,
  outcome: 'confirmado' | 'realizado' | 'faltou',
): Promise<Appointment> {
  try {
    const { data } = await api.post<DataResponse<Appointment>>(
      `/v1/crm/appointments/${id}/outcome`,
      {
        outcome,
      },
    )
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function listAvailableSlots(params: {
  data?: string
  dias?: number
  duracao_minutos?: number
}): Promise<AvailableSlot[]> {
  try {
    const { data } = await api.get<DataResponse<{ horarios: AvailableSlot[] }>>(
      '/v1/crm/appointments/available-slots',
      { params },
    )
    return data.data.horarios
  } catch (error) {
    throw toApiError(error)
  }
}
