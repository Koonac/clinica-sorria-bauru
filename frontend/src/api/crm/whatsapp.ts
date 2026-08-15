import { api, toApiError } from '@/api/client'
import type {
  DataResponse,
  WhatsappChat,
  WhatsappChatFilter,
  WhatsappMessage,
} from '@/api/crm/types'

export type WhatsappChatsPage = {
  data: WhatsappChat[]
  has_more: boolean
  offset: number
  limit: number
}

export async function listWhatsappChats(params?: {
  search?: string
  filter?: WhatsappChatFilter
  limit?: number
  offset?: number
}): Promise<WhatsappChatsPage> {
  try {
    const { data } = await api.get<{
      data: WhatsappChat[]
      meta?: { has_more?: boolean; offset?: number; limit?: number }
    }>('/v1/crm/whatsapp/chats', {
      params,
    })
    return {
      data: data.data,
      has_more: Boolean(data.meta?.has_more),
      offset: data.meta?.offset ?? params?.offset ?? 0,
      limit: data.meta?.limit ?? params?.limit ?? data.data.length,
    }
  } catch (error) {
    throw toApiError(error)
  }
}

export async function markWhatsappChatRead(payload: {
  jid: string
  lead_id?: number | null
}): Promise<{ conversation_key: string; last_read_message_id: number | null; unread_count: number }> {
  try {
    const { data } = await api.post<
      DataResponse<{
        conversation_key: string
        last_read_message_id: number | null
        unread_count: number
      }>
    >('/v1/crm/whatsapp/chats/read', payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function listWhatsappMessages(params: {
  lead_id?: number
  deal_id?: number
  jid?: string
}): Promise<WhatsappMessage[]> {
  try {
    const { data } = await api.get<DataResponse<WhatsappMessage[]>>('/v1/crm/whatsapp/messages', {
      params,
    })
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function sendWhatsappMessage(payload: {
  to: string
  message: string
  contact_name?: string
}): Promise<WhatsappMessage> {
  try {
    const { data } = await api.post<{
      data: { message: WhatsappMessage }
    }>('/v1/crm/whatsapp/send', payload)
    return data.data.message
  } catch (error) {
    throw toApiError(error)
  }
}
