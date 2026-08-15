<script setup lang="ts">
import { computed } from 'vue'
import PageView from '@/components/Layout/PageView.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const greetingName = computed(() => auth.user?.name || auth.user?.username || 'usuário')
const roleLabel = computed(() =>
  auth.user?.role === 'admin' ? 'Administrador' : 'Funcionário',
)
</script>

<template>
  <PageView eyebrow="Início" :title="`Olá, ${greetingName}`">
    <template #description>
      <p class="max-w-2xl text-base leading-relaxed text-brand-ink/70">
        Bem-vindo ao painel da clínica. Use o menu lateral para navegar entre as seções.
      </p>
      <p class="mt-3 text-sm text-brand-ink/50">Perfil: {{ roleLabel }}</p>
    </template>
  </PageView>
</template>
