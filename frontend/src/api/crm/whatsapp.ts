import { api, toApiError } from '@/api/client'
import type { DataResponse, WhatsappMessage } from '@/api/crm/types'

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
