<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import SettingsModal from '@/components/Modals/SettingsModal.vue'
import { NAV_ITEMS } from '@/navigation/nav'
import { useAuthStore } from '@/stores/auth'

const SIDEBAR_KEY = 'sorria.sidebar.collapsed'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const collapsed = ref(false)
const menuOpen = ref(false)
const settingsOpen = ref(false)
const loggingOut = ref(false)

const visibleNavItems = computed(() => {
  const role = auth.user?.role
  return NAV_ITEMS.filter((item) => {
    if (!item.roles?.length) return true
    return role ? item.roles.includes(role) : false
  })
})

onMounted(() => {
  try {
    collapsed.value = localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    collapsed.value = false
  }
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.classList.remove('menu-mobile-aberto')
})

watch(menuOpen, (open) => {
  document.body.classList.toggle('menu-mobile-aberto', open)
})

watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
  },
)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && menuOpen.value && !settingsOpen.value) {
    menuOpen.value = false
  }
}

function toggleCollapsed() {
  collapsed.value = !collapsed.value
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed.value ? '1' : '0')
  } catch {
    // ignore quota / private mode
  }
}

function openSettings() {
  settingsOpen.value = true
  menuOpen.value = false
}

async function sair() {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    await auth.logout()
    await router.replace({ name: 'login' })
  } finally {
    loggingOut.value = false
  }
}

function isActive(name: string) {
  return route.name === name
}
</script>

<template>
  <div class="flex h-dvh min-h-dvh flex-1 flex-col overflow-hidden bg-[#f4f6f8] text-brand-ink md:flex-row">
    <header
      class="relative z-[25] flex h-16 shrink-0 items-center gap-3 border-b border-brand-ink/10 bg-white px-4 md:hidden"
    >
      <button
        type="button"
        class="inline-flex cursor-pointer size-11 shrink-0 items-center justify-center rounded-xl border border-brand-ink/10 text-brand-ink transition hover:border-brand-ink/20 hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
        :aria-expanded="menuOpen"
        aria-controls="app-rail"
        :aria-label="menuOpen ? 'Fechar menu' : 'Abrir menu'"
        @click="menuOpen = !menuOpen"
      >
        <Icon
          :icon="menuOpen ? 'lucide:x' : 'lucide:menu'"
          class="size-[22px]"
          aria-hidden="true"
        />
      </button>
      <img
        src="/brand/sorria-bauru-simbolo.png"
        alt=""
        class="size-9 shrink-0 object-contain"
        width="36"
        height="36"
      />
      <strong class="truncate text-base font-semibold tracking-tight">Sorria Bauru</strong>
    </header>

    <aside
      id="app-rail"
      class="app-rail group/rail relative z-20 flex min-h-0 shrink-0 flex-col self-stretch border-r border-brand-ink/10 bg-white"
      :data-recolhida="collapsed ? '' : undefined"
      :data-menu-aberto="menuOpen ? '' : undefined"
      aria-label="Navegação"
    >
      <div
        class="rail-topo flex min-h-[4.5rem] shrink-0 items-center gap-3 border-b border-brand-ink/10 px-4 py-4"
      >
        <img
          src="/brand/sorria-bauru-simbolo.png"
          alt=""
          class="rail-logo size-10 shrink-0 object-contain"
          width="40"
          height="40"
        />
        <div class="rail-marca flex min-w-0 flex-1 flex-col leading-none">
          <strong class="truncate text-lg font-semibold tracking-tight">Sorria Bauru</strong>
          <span class="mt-1 text-xs text-brand-cyan-ink">Painel da clínica</span>
        </div>
        <button
          type="button"
          class="hidden size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-brand-ink/10 text-brand-ink/55 transition hover:border-brand-ink/20 hover:bg-[#f4f6f8] hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue md:inline-flex"
          :title="collapsed ? 'Expandir menu' : 'Recolher menu'"
          :aria-label="collapsed ? 'Expandir menu' : 'Recolher menu'"
          :aria-expanded="!collapsed"
          aria-controls="app-rail"
          @click="toggleCollapsed"
        >
          <Icon
            :icon="collapsed ? 'lucide:panel-left-open' : 'lucide:panel-left-close'"
            class="size-[18px]"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          class="inline-flex cursor-pointer size-9 shrink-0 items-center justify-center rounded-lg border border-brand-ink/10 text-brand-ink/55 transition hover:border-brand-ink/20 hover:bg-[#f4f6f8] hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue md:hidden"
          title="Fechar menu"
          aria-label="Fechar menu"
          @click="menuOpen = false"
        >
          <Icon icon="lucide:x" class="size-[18px]" aria-hidden="true" />
        </button>
      </div>

      <nav
        class="rail-nav flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3"
        aria-label="Seções"
      >
        <RouterLink
          v-for="item in visibleNavItems"
          :key="item.name"
          :to="item.to"
          class="inline-flex cursor-pointer items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-brand-ink/65 transition hover:bg-[#f4f6f8] hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
          :class="
            isActive(item.name)
              ? 'bg-brand-cyan/15 text-brand-cyan-ink hover:bg-brand-cyan/15 hover:text-brand-cyan-ink'
              : ''
          "
          :title="item.label"
          @click="menuOpen = false"
        >
          <Icon :icon="item.icon" class="size-[18px] shrink-0" aria-hidden="true" />
          <span class="rail-rotulo truncate">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="rail-rodape shrink-0 border-t border-brand-ink/10 p-3">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="inline-flex cursor-pointer size-10 shrink-0 items-center justify-center rounded-xl border border-brand-ink/10 text-brand-ink/55 transition hover:border-brand-ink/20 hover:bg-[#f4f6f8] hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue data-[aberto]:border-brand-cyan data-[aberto]:bg-brand-cyan/15 data-[aberto]:text-brand-cyan-ink [&[data-aberto]_svg]:rotate-45"
            title="Configurações"
            aria-label="Configurações"
            :aria-expanded="settingsOpen"
            aria-haspopup="dialog"
            :data-aberto="settingsOpen ? '' : undefined"
            @click="openSettings"
          >
            <Icon
              icon="lucide:settings"
              class="size-5 transition-transform duration-300"
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            class="rail-sair inline-flex cursor-pointer min-w-0 flex-1 items-center justify-center gap-2.5 rounded-xl border border-brand-ink/10 px-3.5 py-2.5 text-sm font-medium text-brand-ink/65 transition hover:border-brand-ink/20 hover:bg-[#f4f6f8] hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:opacity-55"
            title="Sair"
            aria-label="Sair"
            :disabled="loggingOut"
            @click="sair"
          >
            <Icon icon="lucide:log-out" class="size-[18px] shrink-0" aria-hidden="true" />
            <span class="rail-rotulo">Sair</span>
          </button>
        </div>
      </div>
    </aside>

    <div
      v-show="menuOpen"
      class="fixed inset-0 z-10 bg-black/50 md:hidden"
      aria-hidden="true"
      @click="menuOpen = false"
    />

    <main class="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <RouterView v-slot="{ Component }">
        <component :is="Component" class="min-h-0 w-full flex-1" />
      </RouterView>
    </main>

    <SettingsModal v-model:open="settingsOpen" />
  </div>
</template>
