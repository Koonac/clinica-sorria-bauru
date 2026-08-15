import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, toApiError } from '@/api/client'

export type AuthUser = {
  id: number
  name: string
  username: string
  email: string
  role: 'admin' | 'funcionario'
}

type LoginResponse = {
  token: string
  token_type: string
  user: AuthUser
}

const TOKEN_KEY = 'sorria.auth.token'
const USER_KEY = 'sorria.auth.user'

function loadStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user = ref<AuthUser | null>(loadStoredUser())

  const isAuthenticated = computed(() => Boolean(token.value))
  const isAdmin = computed(() => user.value?.role === 'admin')

  function persist(nextToken: string, nextUser: AuthUser) {
    token.value = nextToken
    user.value = nextUser
    localStorage.setItem(TOKEN_KEY, nextToken)
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
  }

  function clear() {
    token.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  async function login(username: string, password: string) {
    try {
      const { data } = await api.post<LoginResponse>('/v1/auth/login', {
        user: username,
        password,
      })
      persist(data.token, data.user)
      return data.user
    } catch (error) {
      throw toApiError(error)
    }
  }

  async function logout() {
    try {
      if (token.value) {
        await api.post('/v1/auth/logout')
      }
    } catch {
      // Limpa localmente mesmo se a API falhar.
    } finally {
      clear()
    }
  }

  return {
    token,
    user,
    isAuthenticated,
    isAdmin,
    login,
    logout,
    clear,
  }
})
