import { api, toApiError } from '@/api/client'
import type { DataResponse, PipelineKind, PipelineStage } from '@/api/crm/types'

export async function getPipeline(params: {
  kind: PipelineKind
  search?: string
}): Promise<PipelineStage[]> {
  try {
    const { data } = await api.get<DataResponse<PipelineStage[]>>('/v1/crm/pipeline', {
      params,
    })
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function listStages(kind: PipelineKind): Promise<PipelineStage[]> {
  try {
    const { data } = await api.get<DataResponse<PipelineStage[]>>('/v1/crm/pipeline-stages', {
      params: { kind },
    })
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function createStage(payload: {
  kind: PipelineKind
  name: string
  color?: string
  status?: string
  slug?: string
}): Promise<PipelineStage> {
  try {
    const { data } = await api.post<DataResponse<PipelineStage>>(
      '/v1/crm/pipeline-stages',
      payload,
    )
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function updateStage(
  id: number,
  payload: { name?: string; color?: string | null; status?: string },
): Promise<PipelineStage> {
  try {
    const { data } = await api.patch<DataResponse<PipelineStage>>(
      `/v1/crm/pipeline-stages/${id}`,
      payload,
    )
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function deleteStage(id: number): Promise<void> {
  try {
    await api.delete(`/v1/crm/pipeline-stages/${id}`)
  } catch (error) {
    throw toApiError(error)
  }
}

export async function reorderStages(kind: PipelineKind, orderedIds: number[]): Promise<void> {
  try {
    await api.patch('/v1/crm/pipeline-stages/order', {
      kind,
      ordered_ids: orderedIds,
    })
  } catch (error) {
    throw toApiError(error)
  }
}
