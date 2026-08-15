<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import ClinicFormModal from '@/components/Modals/ClinicFormModal.vue'
import SettingsModal from '@/components/Modals/SettingsModal.vue'
import { NAV_ITEMS, type AppRole, type NavItem } from '@/navigation/nav'
import { useAuthStore } from '@/stores/auth'
import { useClinicsStore } from '@/stores/clinics'

const SIDEBAR_KEY = 'sorria.sidebar.collapsed'

const auth = useAuthStore()
const clinics = useClinicsStore()
const router = useRouter()
const route = useRoute()

const collapsed = ref(false)
const menuOpen = ref(false)
const settingsOpen = ref(false)
const clinicMenuOpen = ref(false)
const clinicFormOpen = ref(false)
const loggingOut = ref(false)
const clinicMenuRef = ref<HTMLElement | null>(null)

function canSeeNavItem(item: NavItem, role: AppRole | undefined) {
  if (!item.roles?.length) return true
  return role ? item.roles.includes(role) : false
}

function isAdminOnlyNavItem(item: NavItem) {
  const roles = item.roles
  if (!roles?.length) return false
  return roles.every((role) => role === 'admin')
}

const navGroups = computed(() => {
  const role = auth.user?.role
  const clinicItems = NAV_ITEMS.filter(
    (item) => canSeeNavItem(item, role) && !isAdminOnlyNavItem(item),
  )
  const adminItems = auth.isAdmin
    ? NAV_ITEMS.filter((item) => isAdminOnlyNavItem(item) && canSeeNavItem(item, 'admin'))
    : []

  const groups: { key: string; label?: string; items: NavItem[] }[] = [
    { key: 'clinica', items: clinicItems },
  ]

  if (adminItems.length) {
    groups.push({ key: 'admin', label: 'Admin', items: adminItems })
  }

  return groups
})

const showClinicSwitcher = computed(() => auth.isAdmin)

onMounted(() => {
  try {
    collapsed.value = localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    collapsed.value = false
  }
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('pointerdown', onPointerDown)
  void clinics.bootstrap()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('pointerdown', onPointerDown)
  document.body.classList.remove('menu-mobile-aberto')
})

watch(menuOpen, (open) => {
  document.body.classList.toggle('menu-mobile-aberto', open)
})

watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
    clinicMenuOpen.value = false
  },
)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (clinicMenuOpen.value) {
      clinicMenuOpen.value = false
      return
    }
    if (menuOpen.value && !settingsOpen.value && !clinicFormOpen.value) {
      menuOpen.value = false
    }
  }
}

function onPointerDown(event: PointerEvent) {
  if (!clinicMenuOpen.value) return
  const target = event.target as Node | null
  if (target && clinicMenuRef.value?.contains(target)) return
  clinicMenuOpen.value = false
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
  clinicMenuOpen.value = false
}

function toggleClinicMenu() {
  if (!showClinicSwitcher.value) return
  clinicMenuOpen.value = !clinicMenuOpen.value
}

function selectClinic(id: number) {
  clinics.setActiveClinic(id)
  clinicMenuOpen.value = false
}

function openCreateClinic() {
  clinicMenuOpen.value = false
  clinicFormOpen.value = true
}

async function sair() {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    await auth.logout()
    clinics.clear()
    await router.replace({ name: 'login' })
  } finally {
    loggingOut.value = false
  }
}

function isActive(name: string) {
  const current = String(route.name ?? '')
  return current === name || current.startsWith(`${name}-`)
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
        <div ref="clinicMenuRef" class="rail-marca relative flex min-w-0 flex-1 flex-col leading-none">
          <button
            v-if="showClinicSwitcher"
            type="button"
            class="group/clinic flex w-full min-w-0 cursor-pointer items-center gap-1 rounded-md text-left outline-none transition hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            :aria-expanded="clinicMenuOpen"
            aria-haspopup="listbox"
            aria-label="Selecionar clínica"
            @click="toggleClinicMenu"
          >
            <span class="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
              {{ clinics.activeClinic?.name || 'Selecionar clínica' }}
            </span>
            <Icon
              icon="lucide:chevron-down"
              class="size-3.5 shrink-0 text-brand-ink/40 transition group-hover/clinic:text-brand-blue"
              :class="clinicMenuOpen ? 'rotate-180 text-brand-blue' : ''"
              aria-hidden="true"
            />
          </button>
          <strong v-else class="truncate text-lg font-semibold tracking-tight">
            {{ clinics.activeClinic?.name || 'Sorria Bauru' }}
          </strong>
          <span class="mt-1 truncate text-xs text-brand-cyan-ink">Painel da clínica</span>

          <div
            v-if="clinicMenuOpen"
            class="absolute top-[calc(100%+0.5rem)] left-0 z-30 w-[min(16rem,calc(100vw-5rem))] overflow-hidden rounded-xl border border-brand-ink/10 bg-white py-1 shadow-lg"
            role="listbox"
            aria-label="Clínicas"
          >
            <button
              v-for="clinic in clinics.clinics"
              :key="clinic.id"
              type="button"
              role="option"
              class="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-[#f4f6f8]"
              :class="
                clinic.id === clinics.activeClinicId
                  ? 'font-semibold text-brand-cyan-ink'
                  : 'font-medium text-brand-ink/80'
              "
              :aria-selected="clinic.id === clinics.activeClinicId"
              @click="selectClinic(clinic.id)"
            >
              <span class="min-w-0 flex-1 truncate">{{ clinic.name }}</span>
              <Icon
                v-if="clinic.id === clinics.activeClinicId"
                icon="lucide:check"
                class="size-4 shrink-0"
                aria-hidden="true"
              />
            </button>
            <div class="my-1 border-t border-brand-ink/10" />
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-brand-ink/70 transition hover:bg-[#f4f6f8] hover:text-brand-ink"
              @click="openCreateClinic"
            >
              <Icon icon="lucide:plus" class="size-4 shrink-0" aria-hidden="true" />
              Nova clínica
            </button>
          </div>
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
        <template v-for="group in navGroups" :key="group.key">
          <div
            v-if="group.label"
            class="mt-2 mb-1 flex items-center gap-2 px-3.5"
            role="separator"
            :aria-label="group.label"
          >
            <span class="rail-rotulo text-[11px] font-semibold uppercase tracking-wider text-brand-ink/40">
              {{ group.label }}
            </span>
            <span class="h-px min-w-0 flex-1 bg-brand-ink/10" aria-hidden="true" />
          </div>
          <RouterLink
            v-for="item in group.items"
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
        </template>
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
      <RouterView :key="clinics.activeClinicId ?? 'none'" v-slot="{ Component }">
        <component :is="Component" class="min-h-0 w-full flex-1" />
      </RouterView>
    </main>

    <SettingsModal v-model:open="settingsOpen" />
    <ClinicFormModal v-model:open="clinicFormOpen" />
  </div>
</template>
