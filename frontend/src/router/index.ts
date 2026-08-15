import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore, type AuthUser } from '@/stores/auth'

export type AppRole = AuthUser['role']

declare module 'vue-router' {
  interface RouteMeta {
    guest?: boolean
    requiresAuth?: boolean
    roles?: AppRole[]
    title?: string
    icon?: string
  }
}

const bothRoles: AppRole[] = ['admin', 'funcionario']

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/AppShellLayout.vue'),
      meta: { requiresAuth: true, roles: bothRoles },
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('@/views/HomeView.vue'),
          meta: { requiresAuth: true, roles: bothRoles, title: 'Início', icon: 'lucide:home' },
        },
        {
          path: 'crm',
          name: 'crm',
          component: () => import('@/views/CrmView.vue'),
          meta: {
            requiresAuth: true,
            roles: bothRoles,
            title: 'CRM',
            icon: 'lucide:kanban',
          },
        },
        {
          path: 'agenda',
          name: 'agenda',
          component: () => import('@/views/AgendaView.vue'),
          meta: {
            requiresAuth: true,
            roles: bothRoles,
            title: 'Agenda',
            icon: 'lucide:calendar',
          },
        },
        {
          path: 'whatsapp',
          name: 'whatsapp',
          component: () => import('@/views/WhatsappView.vue'),
          meta: {
            requiresAuth: true,
            roles: bothRoles,
            title: 'WhatsApp',
            icon: 'lucide:message-circle',
          },
        },
        {
          path: 'usuarios',
          name: 'users',
          component: () => import('@/views/UsersView.vue'),
          meta: {
            requiresAuth: true,
            roles: ['admin'],
            title: 'Usuários',
            icon: 'lucide:users',
          },
        },
        {
          path: 'usuarios/novo',
          redirect: { name: 'users' },
        },
      ],
    },
  ],
})

function routeRoles(to: { matched: { meta: { roles?: AppRole[] } }[] }): AppRole[] | undefined {
  for (let i = to.matched.length - 1; i >= 0; i -= 1) {
    const roles = to.matched[i]?.meta.roles
    if (roles?.length) return roles
  }
  return undefined
}

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guest && auth.isAuthenticated) {
    return { name: 'home' }
  }

  const roles = routeRoles(to)
  if (roles && auth.isAuthenticated) {
    const role = auth.user?.role
    if (!role || !roles.includes(role)) {
      return { name: 'home' }
    }
  }

  return true
})

export default router
