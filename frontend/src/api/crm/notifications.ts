import { api, toApiError } from '@/api/client'

export type CrmNotificationType =
  | 'pre_agendamento'
  | 'urgencia'
  | 'reclamacao'
  | 'pedido_humano'
  | 'handoff'
  | 'consulta_cancelada'
  | 'consulta_confirmada'

export type CrmNotification = {
  id: number
  type: CrmNotificationType
  priority: 'normal' | 'urgent'
  title: string
  body: string | null
  lead_id: number | null
  lead_name: string | null
  appointment_id: number | null
  data: Record<string, unknown> | null
  read_at: string | null
  created_at: string
}

export type CrmNotificationList = {
  data: CrmNotification[]
  meta: { unread_count: number }
}

export async function listNotifications(params?: {
  unread?: boolean
  limit?: number
}): Promise<CrmNotificationList> {
  try {
    const { data } = await api.get<CrmNotificationList>('/v1/crm/notifications', {
      params: {
        unread: params?.unread ? 1 : undefined,
        limit: params?.limit,
      },
    })
    return data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function markNotificationRead(id: number): Promise<void> {
  try {
    await api.post(`/v1/crm/notifications/${id}/read`)
  } catch (error) {
    throw toApiError(error)
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  try {
    await api.post('/v1/crm/notifications/read-all')
  } catch (error) {
    throw toApiError(error)
  }
}
