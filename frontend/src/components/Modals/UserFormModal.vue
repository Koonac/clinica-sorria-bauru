<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import { createUser, updateUser } from '@/api/users'
import type { AuthUser } from '@/stores/auth'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  user: AuthUser | null
}>()

const emit = defineEmits<{
  saved: [user: AuthUser]
}>()

const inputClass =
  'w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25'

const isEdit = computed(() => Boolean(props.user))

const form = reactive({
  name: '',
  username: '',
  email: '',
  password: '',
  passwordConfirmation: '',
  role: 'funcionario' as AuthUser['role'],
})

const fieldErrors = reactive({
  name: '',
  username: '',
  email: '',
  password: '',
  passwordConfirmation: '',
  role: '',
})

const showPassword = ref(false)
const showConfirmation = ref(false)
const loading = ref(false)
const formError = ref('')
const panelRef = ref<HTMLElement | null>(null)

const canSubmit = computed(() => {
  if (loading.value) return false
  if (!form.name.trim() || !form.username.trim() || !form.email.trim()) return false
  if (!isEdit.value && !form.password) return false
  if (form.password && !form.passwordConfirmation) return false
  return true
})

function clearFieldErrors() {
  fieldErrors.name = ''
  fieldErrors.username = ''
  fieldErrors.email = ''
  fieldErrors.password = ''
  fieldErrors.passwordConfirmation = ''
  fieldErrors.role = ''
}

function resetForm() {
  form.name = props.user?.name ?? ''
  form.username = props.user?.username ?? ''
  form.email = props.user?.email ?? ''
  form.password = ''
  form.passwordConfirmation = ''
  form.role = props.user?.role ?? 'funcionario'
  showPassword.value = false
  showConfirmation.value = false
  loading.value = false
  formError.value = ''
  clearFieldErrors()
}

function close() {
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    close()
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    resetForm()
    document.addEventListener('keydown', onKeydown)
    requestAnimationFrame(() => {
      panelRef.value?.querySelector<HTMLInputElement>('input')?.focus()
    })
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})

function applyApiFieldErrors(details?: Record<string, string[]>) {
  if (!details) return
  fieldErrors.name = details.name?.[0] || ''
  fieldErrors.username = details.username?.[0] || ''
  fieldErrors.email = details.email?.[0] || ''
  fieldErrors.password = details.password?.[0] || ''
  fieldErrors.role = details.role?.[0] || ''
}

async function onSubmit() {
  if (!canSubmit.value) return

  clearFieldErrors()
  formError.value = ''

  if (form.password && form.password !== form.passwordConfirmation) {
    fieldErrors.passwordConfirmation = 'As senhas não coincidem.'
    return
  }

  if (!isEdit.value && !form.password) {
    fieldErrors.password = 'Informe uma senha.'
    return
  }

  loading.value = true

  try {
    let saved: AuthUser

    if (isEdit.value && props.user) {
      const payload: {
        name: string
        username: string
        email: string
        role: AuthUser['role']
        password?: string
      } = {
        name: form.name.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        role: form.role,
      }
      if (form.password) payload.password = form.password
      saved = await updateUser(props.user.id, payload)
    } else {
      saved = await createUser({
        name: form.name.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      })
    }

    emit('saved', saved)
    close()
  } catch (error) {
    if (error instanceof ApiError) {
      applyApiFieldErrors(error.details)
      const hasFieldError = Object.values(fieldErrors).some(Boolean)
      if (!hasFieldError) {
        formError.value =
          error.message ||
          (isEdit.value ? 'Não foi possível salvar o usuário.' : 'Não foi possível criar o usuário.')
      }
    } else {
      formError.value = 'Servidor indisponível. Tente novamente.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      @click.self="close"
    >
      <div
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="isEdit ? 'user-edit-title' : 'user-create-title'"
        class="flex max-h-[min(90vh,820px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-brand-ink/10 bg-white shadow-2xl"
        @click.stop
      >
        <header
          class="flex shrink-0 items-start justify-between gap-3 border-b border-brand-ink/10 px-5 pt-5 pb-4"
        >
          <div class="min-w-0">
            <p class="mb-1 text-[0.65rem] font-medium tracking-[0.22em] text-brand-cyan-ink uppercase">
              Usuários
            </p>
            <h2
              :id="isEdit ? 'user-edit-title' : 'user-create-title'"
              class="text-xl font-semibold tracking-tight text-brand-ink"
            >
              {{ isEdit ? 'Editar usuário' : 'Cadastrar usuário' }}
            </h2>
          </div>
          <button
            type="button"
            class="inline-flex cursor-pointer size-8 items-center justify-center rounded-full text-brand-ink/55 transition hover:bg-[#f4f6f8] hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            aria-label="Fechar"
            @click="close"
          >
            <Icon icon="lucide:x" class="size-[18px]" aria-hidden="true" />
          </button>
        </header>

        <form class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5" @submit.prevent="onSubmit">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Nome</span>
            <input
              v-model="form.name"
              type="text"
              name="name"
              autocomplete="name"
              required
              maxlength="190"
              :class="inputClass"
            />
            <span v-if="fieldErrors.name" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.name }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Usuário</span>
            <input
              v-model="form.username"
              type="text"
              name="username"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              required
              maxlength="64"
              :class="inputClass"
            />
            <span v-if="fieldErrors.username" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.username }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">E-mail</span>
            <input
              v-model="form.email"
              type="email"
              name="email"
              autocomplete="email"
              required
              maxlength="190"
              :class="inputClass"
            />
            <span v-if="fieldErrors.email" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.email }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">
              {{ isEdit ? 'Nova senha (opcional)' : 'Senha' }}
            </span>
            <div class="relative">
              <input
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                name="password"
                autocomplete="new-password"
                :required="!isEdit"
                class="w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 pr-11 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
              />
              <button
                type="button"
                class="absolute top-1/2 right-3 grid -translate-y-1/2 cursor-pointer place-items-center text-brand-ink/55 transition hover:text-brand-cyan-ink"
                :aria-label="showPassword ? 'Ocultar senha' : 'Mostrar senha'"
                @click="showPassword = !showPassword"
              >
                <Icon :icon="showPassword ? 'lucide:eye-off' : 'lucide:eye'" class="size-5" />
              </button>
            </div>
            <span v-if="fieldErrors.password" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.password }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Confirmar senha</span>
            <div class="relative">
              <input
                v-model="form.passwordConfirmation"
                :type="showConfirmation ? 'text' : 'password'"
                name="password_confirmation"
                autocomplete="new-password"
                :required="!isEdit || Boolean(form.password)"
                class="w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 pr-11 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
              />
              <button
                type="button"
                class="absolute top-1/2 right-3 grid -translate-y-1/2 cursor-pointer place-items-center text-brand-ink/55 transition hover:text-brand-cyan-ink"
                :aria-label="showConfirmation ? 'Ocultar confirmação' : 'Mostrar confirmação'"
                @click="showConfirmation = !showConfirmation"
              >
                <Icon :icon="showConfirmation ? 'lucide:eye-off' : 'lucide:eye'" class="size-5" />
              </button>
            </div>
            <span
              v-if="fieldErrors.passwordConfirmation"
              class="text-sm text-brand-ink/70"
              role="alert"
            >
              {{ fieldErrors.passwordConfirmation }}
            </span>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-brand-ink/80">Perfil</span>
            <select v-model="form.role" name="role" required :class="inputClass">
              <option value="funcionario">Funcionário</option>
              <option value="admin">Administrador</option>
            </select>
            <span v-if="fieldErrors.role" class="text-sm text-brand-ink/70" role="alert">
              {{ fieldErrors.role }}
            </span>
          </label>

          <p
            v-if="formError"
            class="rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
            role="alert"
          >
            {{ formError }}
          </p>

          <div class="mt-1 flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              :disabled="!canSubmit"
              class="cursor-pointer rounded-full bg-brand-cyan px-6 py-3 text-sm font-semibold text-brand-ink transition hover:-translate-y-px hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span v-if="loading">Salvando…</span>
              <span v-else>{{ isEdit ? 'Salvar' : 'Cadastrar' }}</span>
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-full border border-brand-ink/15 px-6 py-3 text-sm font-medium text-brand-ink/70 transition hover:border-brand-ink/25 hover:bg-[#f4f6f8] hover:text-brand-ink"
              @click="close"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
