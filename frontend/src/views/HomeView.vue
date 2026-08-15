<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

async function sair() {
  await auth.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="min-h-dvh bg-white px-6 py-6 text-brand-ink">
    <header class="mx-auto flex max-w-3xl items-center gap-3">
      <img
        src="/brand/sorria-bauru-simbolo.png"
        alt=""
        class="h-10 w-10 object-contain"
        width="40"
        height="40"
      />
      <div>
        <p class="text-[0.7rem] tracking-[0.24em] text-brand-cyan-ink uppercase">Sorria Bauru</p>
        <h1 class="text-xl font-semibold leading-tight">
          Olá, {{ auth.user?.name || auth.user?.username }}
        </h1>
      </div>
      <button
        type="button"
        class="ml-auto rounded-full border border-brand-ink/10 bg-white px-4 py-2 text-sm font-medium transition hover:border-brand-cyan hover:text-brand-cyan-ink"
        @click="sair"
      >
        Sair
      </button>
    </header>

    <main class="mx-auto mt-8 max-w-3xl">
      <p class="text-base leading-relaxed text-brand-ink/80">
        Login conectado. O painel da clínica entra na próxima etapa.
      </p>
      <p class="mt-3 text-sm text-brand-ink/55">Perfil: {{ auth.user?.role }}</p>
    </main>
  </div>
</template>
