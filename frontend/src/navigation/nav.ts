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
    label: 'Dashboard',
    icon: 'lucide:layout-dashboard',
    to: { name: 'home' },
    roles: ['admin'],
  },
  {
    name: 'crm',
    label: 'CRM',
    icon: 'lucide:kanban',
    to: { name: 'crm' },
  },
  {
    name: 'contacts',
    label: 'Contatos',
    icon: 'lucide:book-user',
    to: { name: 'contacts' },
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
    name: 'services',
    label: 'Serviços',
    icon: 'lucide:stethoscope',
    to: { name: 'services' },
    roles: ['admin'],
  },
  {
    name: 'agents',
    label: 'Agents',
    icon: 'lucide:bot',
    to: { name: 'agents' },
    roles: ['admin'],
  },
  {
    name: 'users',
    label: 'Usuários',
    icon: 'lucide:users',
    to: { name: 'users' },
    roles: ['admin'],
  },
]
