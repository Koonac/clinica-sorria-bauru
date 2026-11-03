export type BusinessTemplate = 'clinica' | 'imobiliaria'

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
]

export function resolveBusinessTemplate(value: string | null | undefined): BusinessTemplate {
  return value === 'imobiliaria' ? 'imobiliaria' : 'clinica'
}

export function isImobiliariaTemplate(value: string | null | undefined): boolean {
  return resolveBusinessTemplate(value) === 'imobiliaria'
}

export function templateLabel(value: string | null | undefined): string {
  return resolveBusinessTemplate(value) === 'imobiliaria' ? 'Imobiliária' : 'Clínica'
}

export function appointmentsNavLabel(value: string | null | undefined): string {
  return isImobiliariaTemplate(value) ? 'Visitas' : 'Consultas'
}

export function personLabel(value: string | null | undefined): string {
  return isImobiliariaTemplate(value) ? 'Cliente' : 'Paciente'
}
