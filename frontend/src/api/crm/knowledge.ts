import { api, toApiError } from '@/api/client'
import type { DataResponse } from '@/api/crm/types'

export type KnowledgeCategory = 'endereco' | 'convenios' | 'pagamento' | 'procedimentos' | 'outros'

export type KnowledgeEntry = {
  id: number
  clinic_id: number
  category: KnowledgeCategory
  title: string | null
  content: string
  position: number
  active: boolean
  created_at: string
  updated_at: string
}

export type KnowledgeEntryPayload = {
  category: KnowledgeCategory
  title?: string | null
  content: string
  active?: boolean
}

export async function listKnowledgeEntries(): Promise<KnowledgeEntry[]> {
  try {
    const { data } = await api.get<DataResponse<KnowledgeEntry[]>>('/v1/crm/knowledge')
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function createKnowledgeEntry(
  payload: KnowledgeEntryPayload,
): Promise<KnowledgeEntry> {
  try {
    const { data } = await api.post<DataResponse<KnowledgeEntry>>('/v1/crm/knowledge', payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function updateKnowledgeEntry(
  id: number,
  payload: Partial<KnowledgeEntryPayload>,
): Promise<KnowledgeEntry> {
  try {
    const { data } = await api.patch<DataResponse<KnowledgeEntry>>(
      `/v1/crm/knowledge/${id}`,
      payload,
    )
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function deleteKnowledgeEntry(id: number): Promise<void> {
  try {
    await api.delete(`/v1/crm/knowledge/${id}`)
  } catch (error) {
    throw toApiError(error)
  }
}
