<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const ready = ref(false)

const canSubmit = computed(
  () => username.value.trim().length > 0 && password.value.length > 0 && !loading.value,
)

onMounted(() => {
  requestAnimationFrame(() => {
    ready.value = true
  })
})

async function onSubmit() {
  if (!canSubmit.value) return

  loading.value = true
  errorMessage.value = ''

  try {
    await auth.login(username.value.trim(), password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect || '/')
  } catch (error) {
    if (error instanceof ApiError) {
      const fieldError = error.details?.user?.[0] || error.details?.email?.[0]
      errorMessage.value = fieldError || error.message || 'Não foi possível entrar.'
    } else {
      errorMessage.value = 'Servidor indisponível. Tente novamente.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="relative flex min-h-dvh items-center justify-center overflow-hidden bg-white px-5 py-10 text-brand-ink"
  >
    <div
      class="pointer-events-none absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-brand-cyan/20 blur-3xl"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute -bottom-28 right-[-10%] h-72 w-72 rounded-full bg-brand-blue/10 blur-3xl"
      aria-hidden="true"
    />

    <div
      class="relative z-10 flex w-full max-w-sm flex-col items-center gap-8 transition duration-700 ease-out"
      :class="ready ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'"
    >
      <header class="flex flex-col items-center gap-4 text-center">
        <img
          src="/brand/sorria-bauru-simbolo.png"
          alt=""
          class="h-20 w-20 object-contain motion-safe:animate-[fade-up_0.9s_ease_both]"
          width="80"
          height="80"
        />
        <div>
          <h1 class="text-3xl font-semibold tracking-tight text-brand-blue">Sorria Bauru</h1>
          <p class="mt-1 text-[0.7rem] font-medium tracking-[0.28em] text-brand-cyan-ink uppercase">
            Odontologia
          </p>
        </div>
      </header>

      <form class="flex w-full flex-col gap-4 motion-safe:animate-[fade-up_0.8s_ease_0.1s_both]" @submit.prevent="onSubmit">
        <p class="mb-1 text-center text-sm text-brand-ink/65">Acesso à clínica</p>

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-brand-ink/80">Usuário</span>
          <input
            v-model="username"
            type="text"
            name="user"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            placeholder="Admin"
            required
            class="w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
          />
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-brand-ink/80">Senha</span>
          <div class="relative">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              name="password"
              autocomplete="current-password"
              placeholder="••••••••"
              required
              class="w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 pr-11 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
            />
            <button
              type="button"
              class="absolute top-1/2 right-3 grid -translate-y-1/2 place-items-center text-brand-ink/55 transition hover:text-brand-cyan-ink"
              :aria-label="showPassword ? 'Ocultar senha' : 'Mostrar senha'"
              @click="showPassword = !showPassword"
            >
              <Icon :icon="showPassword ? 'lucide:eye-off' : 'lucide:eye'" width="20" height="20" />
            </button>
          </div>
        </label>

        <p
          v-if="errorMessage"
          class="rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
          role="alert"
        >
          {{ errorMessage }}
        </p>

        <button
          type="submit"
          :disabled="!canSubmit"
          class="mt-1 w-full rounded-full bg-brand-cyan px-5 py-3.5 text-base font-semibold text-brand-ink transition hover:-translate-y-px hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-55"
        >
          <span v-if="loading">Entrando…</span>
          <span v-else>Entrar</span>
        </button>
      </form>
    </div>
  </div>
</template>
