import type { AuthUser } from '@/stores/auth'

export type AppRole = AuthUser['role']

export type NavItem = {
  name: string
  label: string
  icon: string
  to: { name: string }
  roles?: AppRole[]
}

export const NAV_ITEMS: NavItem[] = [
  {
    name: 'home',
    label: 'Início',
    icon: 'lucide:home',
    to: { name: 'home' },
  },
  {
    name: 'crm',
    label: 'CRM',
    icon: 'lucide:kanban',
    to: { name: 'crm' },
  },
  {
    name: 'agenda',
    label: 'Agenda',
    icon: 'lucide:calendar',
    to: { name: 'agenda' },
  },
  {
    name: 'whatsapp',
    label: 'WhatsApp',
    icon: 'lucide:message-circle',
    to: { name: 'whatsapp' },
  },
  {
    name: 'users',
    label: 'Usuários',
    icon: 'lucide:users',
    to: { name: 'users' },
    roles: ['admin'],
  },
]
