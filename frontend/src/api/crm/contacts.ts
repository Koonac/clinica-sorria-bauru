import { api, toApiError } from '@/api/client'
import type { Contact, Paginated } from '@/api/crm/types'

export async function listContacts(params?: { search?: string }): Promise<Paginated<Contact>> {
  try {
    const { data } = await api.get<Paginated<Contact>>('/v1/crm/contacts', { params })
    return data
  } catch (error) {
    throw toApiError(error)
  }
}
