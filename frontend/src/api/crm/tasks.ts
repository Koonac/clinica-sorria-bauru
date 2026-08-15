import { api, toApiError } from '@/api/client'
import type {
  CreateTaskPayload,
  CrmTask,
  DataResponse,
  UpdateTaskPayload,
} from '@/api/crm/types'

export async function listTasks(params?: {
  lead_id?: number
  deal_id?: number
  pending?: boolean
  due_from?: string
  due_to?: string
}): Promise<CrmTask[]> {
  try {
    const { data } = await api.get<DataResponse<CrmTask[]>>('/v1/crm/tasks', { params })
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function createTask(payload: CreateTaskPayload): Promise<CrmTask> {
  try {
    const { data } = await api.post<DataResponse<CrmTask>>('/v1/crm/tasks', payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function updateTask(id: number, payload: UpdateTaskPayload): Promise<CrmTask> {
  try {
    const { data } = await api.patch<DataResponse<CrmTask>>(`/v1/crm/tasks/${id}`, payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function deleteTask(id: number): Promise<void> {
  try {
    await api.delete(`/v1/crm/tasks/${id}`)
  } catch (error) {
    throw toApiError(error)
  }
}
