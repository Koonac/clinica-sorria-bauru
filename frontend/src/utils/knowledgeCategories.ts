import type { KnowledgeCategory } from '@/api/crm/knowledge'
import { isImobiliariaTemplate, type BusinessTemplate } from '@/utils/businessTemplate'

export type KnowledgeCategoryMeta = {
  value: KnowledgeCategory
  label: string
  icon: string
  hint: string
  titlePlaceholder: string
  contentPlaceholder: string
}

export const KNOWLEDGE_CATEGORIES: KnowledgeCategoryMeta[] = [
  {
    value: 'endereco',
    label: 'Endereço e como chegar',
    icon: 'lucide:map-pin',
    hint: 'Endereço completo, referências, estacionamento, link do mapa.',
    titlePlaceholder: 'Ex.: Endereço',
    contentPlaceholder: 'Ex.: Rua Exemplo, 123 – Centro, Bauru/SP. Em frente à praça…',
  },
  {
    value: 'convenios',
    label: 'Convênios aceitos',
    icon: 'lucide:shield-check',
    hint: 'Planos aceitos e regras (carência, autorização prévia).',
    titlePlaceholder: 'Ex.: Planos aceitos',
    contentPlaceholder: 'Ex.: Aceitamos OdontoPrev, Amil Dental e Bradesco Dental.',
  },
  {
    value: 'pagamento',
    label: 'Formas de pagamento',
    icon: 'lucide:credit-card',
    hint: 'Pix, cartão, parcelamento, descontos à vista.',
    titlePlaceholder: 'Ex.: Parcelamento',
    contentPlaceholder: 'Ex.: Pix, dinheiro e cartão. Parcelamos em até 10x sem juros.',
  },
  {
    value: 'procedimentos',
    label: 'Procedimentos',
    icon: 'lucide:stethoscope',
    hint: 'Orientações gerais: preparo, duração, cuidados. Preços ficam em Serviços.',
    titlePlaceholder: 'Ex.: Clareamento',
    contentPlaceholder: 'Ex.: O clareamento é feito em 2 sessões; evite café e vinho por 48h.',
  },
  {
    value: 'outros',
    label: 'Outras perguntas frequentes',
    icon: 'lucide:messages-square',
    hint: 'Qualquer dúvida recorrente dos pacientes.',
    titlePlaceholder: 'Ex.: Atendem crianças?',
    contentPlaceholder: 'Ex.: Sim, temos odontopediatria a partir dos 3 anos.',
  },
]

const IMOBILIARIA_OVERRIDES: Partial<
  Record<KnowledgeCategory, Partial<KnowledgeCategoryMeta>>
> = {
  outros: {
    hint: 'Qualquer dúvida recorrente dos clientes.',
    titlePlaceholder: 'Ex.: Aceitam pets?',
    contentPlaceholder: 'Ex.: Sim, a maioria dos imóveis aceita pets de pequeno porte.',
  },
  pagamento: {
    hint: 'Entrada, financiamento, aluguel, caução, IPTU.',
    titlePlaceholder: 'Ex.: Financiamento',
    contentPlaceholder: 'Ex.: Aceitamos financiamento bancário e parcelamento da entrada.',
  },
}

export function knowledgeCategoriesFor(
  template: BusinessTemplate | string | null | undefined,
): KnowledgeCategoryMeta[] {
  const imobiliaria = isImobiliariaTemplate(template)
  return KNOWLEDGE_CATEGORIES.filter((category) => {
    if (!imobiliaria) return true
    return category.value === 'endereco' || category.value === 'pagamento' || category.value === 'outros'
  }).map((category) => {
    if (!imobiliaria) return category
    return { ...category, ...IMOBILIARIA_OVERRIDES[category.value] }
  })
}
