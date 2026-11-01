import { api, toApiError } from '@/api/client'
import type { DataResponse } from '@/api/crm/types'

export type CalendarProvider = 'google' | 'crm_tasks'

export type CalendarStatus = {
  configured: boolean
  provedor: CalendarProvider
  calendar_id: string | null
}

export type CalendarEvent = {
  id: string
  summary: string
  description: string
  location: string
  htmlLink: string | null
  allDay: boolean
  start: string | null
  end: string | null
}

export type CalendarEventPayload = {
  summary: string
  start: string
  end: string
  all_day?: boolean
  description?: string | null
  location?: string | null
}

export async function getCalendarStatus(): Promise<CalendarStatus> {
  try {
    const { data } = await api.get<DataResponse<CalendarStatus>>('/v1/crm/calendar/status')
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function listCalendarEvents(params: {
  timeMin: string
  timeMax: string
}): Promise<CalendarEvent[]> {
  try {
    const { data } = await api.get<DataResponse<CalendarEvent[]>>('/v1/crm/calendar/events', {
      params,
    })
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function createCalendarEvent(payload: CalendarEventPayload): Promise<CalendarEvent> {
  try {
    const { data } = await api.post<DataResponse<CalendarEvent>>('/v1/crm/calendar/events', payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function updateCalendarEvent(
  id: string,
  payload: CalendarEventPayload,
): Promise<CalendarEvent> {
  try {
    const { data } = await api.patch<DataResponse<CalendarEvent>>(
      `/v1/crm/calendar/events/${encodeURIComponent(id)}`,
      payload,
    )
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  try {
    await api.delete(`/v1/crm/calendar/events/${encodeURIComponent(id)}`)
  } catch (error) {
    throw toApiError(error)
  }
}
