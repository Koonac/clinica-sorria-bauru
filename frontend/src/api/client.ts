import axios, { AxiosError, type AxiosInstance } from 'axios'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

export class ApiError extends Error {
  status: number
  details?: Record<string, string[]>

  constructor(message: string, status: number, details?: Record<string, string[]>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sorria.auth.token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (error instanceof AxiosError) {
    const data = error.response?.data as
      | { message?: string; erro?: string; errors?: Record<string, string[]> }
      | undefined

    const message =
      data?.message || data?.erro || error.message || `Erro ${error.response?.status ?? 0}`

    return new ApiError(message, error.response?.status ?? 0, data?.errors)
  }

  if (error instanceof Error) {
    return new ApiError(error.message, 0)
  }

  return new ApiError('Erro inesperado', 0)
}
