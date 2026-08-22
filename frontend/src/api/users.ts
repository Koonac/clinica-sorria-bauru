import { api, toApiError } from '@/api/client'
import type { AuthUser } from '@/stores/auth'

export type CreateUserPayload = {
  name: string
  username: string
  email: string
  password: string
  role: 'admin' | 'funcionario'
  clinic_id: number
}

export type UpdateUserPayload = {
  name?: string
  username?: string
  email?: string
  password?: string
  role?: AuthUser['role']
  clinic_id?: number
}

type UserResponse = {
  data: AuthUser
}

type PaginatedUsers = {
  data: AuthUser[]
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export async function listUsers(params?: {
  search?: string
  role?: AuthUser['role']
}): Promise<PaginatedUsers> {
  try {
    const { data } = await api.get<PaginatedUsers>('/v1/users', { params })
    return data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function createUser(payload: CreateUserPayload): Promise<AuthUser> {
  try {
    const { data } = await api.post<UserResponse>('/v1/users', payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function updateUser(id: number, payload: UpdateUserPayload): Promise<AuthUser> {
  try {
    const { data } = await api.patch<UserResponse>(`/v1/users/${id}`, payload)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function deleteUser(id: number): Promise<void> {
  try {
    await api.delete(`/v1/users/${id}`)
  } catch (error) {
    throw toApiError(error)
  }
}
