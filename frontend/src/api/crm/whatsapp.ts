import { api, toApiError } from '@/api/client'
import type {
  DataResponse,
  WhatsappChat,
  WhatsappChatFilter,
  WhatsappMessage,
} from '@/api/crm/types'

export async function listWhatsappChats(params?: {
  search?: string
  filter?: WhatsappChatFilter
}): Promise<WhatsappChat[]> {
  try {
    const { data } = await api.get<DataResponse<WhatsappChat[]>>('/v1/crm/whatsapp/chats', {
      params,
    })
    return data.data
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
