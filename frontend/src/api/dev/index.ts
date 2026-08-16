import { api, toApiError } from '@/api/client'

export type TokenDayPoint = {
  date: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cost: number
  calls: number
}

export type TokenBreakdownRow = {
  purpose?: string
  model?: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cost: number
  calls: number
}

export type TokenUsageStats = {
  dias: number
  totals: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    cost: number
    calls: number
  }
  by_day: TokenDayPoint[]
  by_purpose: TokenBreakdownRow[]
  by_model: TokenBreakdownRow[]
}

export type OutboundHttpLogListItem = {
  id: number
  clinic_id: number | null
  provider: string
  method: string
  url: string
  response_status: number | null
  duration_ms: number | null
  error: string | null
  created_at: string | null
}

export type OutboundHttpLogDetail = OutboundHttpLogListItem & {
  request_headers: Record<string, unknown> | null
  request_body: string | null
  response_body: string | null
}

export type PaginatedOutboundHttpLogs = {
  data: OutboundHttpLogListItem[]
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export type SystemSettings = {
  ai_attendance_summary_system_prompt: string
  openrouter_transcription_model: string
  openrouter_transcription_language: string
  openrouter_vision_model: string
}

export async function getTokenUsageStats(dias = 30): Promise<TokenUsageStats> {
  try {
    const { data } = await api.get<{ data: TokenUsageStats }>('/v1/dev/tokens/stats', {
      params: { dias },
    })
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function listOutboundHttpLogs(params?: {
  provider?: string
  status?: number | ''
  search?: string
  from?: string
  to?: string
  page?: number
  per_page?: number
}): Promise<PaginatedOutboundHttpLogs> {
  try {
    const { data } = await api.get<PaginatedOutboundHttpLogs>('/v1/dev/logs', { params })
    return data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function getOutboundHttpLog(id: number): Promise<OutboundHttpLogDetail> {
  try {
    const { data } = await api.get<{ data: OutboundHttpLogDetail }>(`/v1/dev/logs/${id}`)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export type OpenRouterModelCapability = 'text' | 'tools' | 'transcription' | 'vision'

export type OpenRouterModel = {
  id: string
  name: string
  label: string
  value: string
  context_length?: number | null
}

export async function listOpenRouterModels(
  capability: OpenRouterModelCapability,
): Promise<OpenRouterModel[]> {
  try {
    const { data } = await api.get<{ data: { models: OpenRouterModel[] } }>(
      '/v1/dev/openrouter-models',
      { params: { capability } },
    )
    return data.data.models
  } catch (error) {
    throw toApiError(error)
  }
}

export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const { data } = await api.get<{ data: SystemSettings }>('/v1/dev/settings')
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function updateSystemSettings(
  payload: Partial<SystemSettings>,
): Promise<SystemSettings> {
  try {
    const { data } = await api.put<{ data: SystemSettings }>('/v1/dev/settings', payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}
