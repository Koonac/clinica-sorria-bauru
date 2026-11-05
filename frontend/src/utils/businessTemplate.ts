export type BusinessTemplate = 'clinica' | 'imobiliaria' | 'loja_roupas'

export const BUSINESS_TEMPLATES: {
  value: BusinessTemplate
  label: string
  description: string
  icon: string
}[] = [
  {
    value: 'clinica',
    label: 'Clínica',
    description: 'Consultas, serviços e base de conhecimento odontológica.',
    icon: 'lucide:stethoscope',
  },
  {
    value: 'imobiliaria',
    label: 'Imobiliária',
    description: 'Visitas, imóveis e base de conhecimento reduzida.',
    icon: 'lucide:building-2',
  },
  {
    value: 'loja_roupas',
    label: 'Loja de roupas',
    description: 'Produtos, tamanhos e atendimento sem agenda.',
    icon: 'lucide:shirt',
  },
]

const TEMPLATE_VALUES = BUSINESS_TEMPLATES.map((t) => t.value)

export function resolveBusinessTemplate(value: string | null | undefined): BusinessTemplate {
  return TEMPLATE_VALUES.includes(value as BusinessTemplate)
    ? (value as BusinessTemplate)
    : 'clinica'
}

export function isImobiliariaTemplate(value: string | null | undefined): boolean {
  return resolveBusinessTemplate(value) === 'imobiliaria'
}

export function isLojaRoupasTemplate(value: string | null | undefined): boolean {
  return resolveBusinessTemplate(value) === 'loja_roupas'
}

/** Loja de roupas não tem Agenda/Consultas nem tools de agendamento. */
export function usesScheduling(value: string | null | undefined): boolean {
  return !isLojaRoupasTemplate(value)
}

export function templateLabel(value: string | null | undefined): string {
  const template = resolveBusinessTemplate(value)
  return BUSINESS_TEMPLATES.find((t) => t.value === template)?.label ?? 'Clínica'
}

/** Rota do catálogo (Serviços / Imóveis / Produtos) de cada template. */
export function catalogRouteFor(value: string | null | undefined): string {
  const template = resolveBusinessTemplate(value)
  if (template === 'imobiliaria') return 'properties'
  if (template === 'loja_roupas') return 'products'
  return 'services'
}

export function appointmentsNavLabel(value: string | null | undefined): string {
  return isImobiliariaTemplate(value) ? 'Visitas' : 'Consultas'
}

export function personLabel(value: string | null | undefined): string {
  return resolveBusinessTemplate(value) === 'clinica' ? 'Paciente' : 'Cliente'
}
