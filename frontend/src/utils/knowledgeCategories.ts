import type { KnowledgeCategory } from '@/api/crm/knowledge'
import { resolveBusinessTemplate, type BusinessTemplate } from '@/utils/businessTemplate'

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
    value: 'trocas',
    label: 'Trocas e devoluções',
    icon: 'lucide:repeat',
    hint: 'Prazo para troca, condições (etiqueta, nota), devolução e vale-troca.',
    titlePlaceholder: 'Ex.: Política de troca',
    contentPlaceholder: 'Ex.: Trocas em até 30 dias com etiqueta e nota fiscal. Peças em promoção não têm troca.',
  },
  {
    value: 'entrega',
    label: 'Entrega e frete',
    icon: 'lucide:truck',
    hint: 'Regiões atendidas, prazos, valor do frete, retirada na loja.',
    titlePlaceholder: 'Ex.: Entrega em Bauru',
    contentPlaceholder: 'Ex.: Entregamos em Bauru em até 2 dias úteis. Frete grátis acima de R$ 200.',
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

type CategoryOverrides = Partial<Record<KnowledgeCategory, Partial<KnowledgeCategoryMeta>>>

/** Categorias de cada template (espelha ClinicKnowledgeEntry::categoriesFor no backend). */
const TEMPLATE_CATEGORIES: Record<BusinessTemplate, KnowledgeCategory[]> = {
  clinica: ['endereco', 'convenios', 'pagamento', 'procedimentos', 'outros'],
  imobiliaria: ['endereco', 'pagamento', 'outros'],
  loja_roupas: ['endereco', 'pagamento', 'trocas', 'entrega', 'outros'],
}

const IMOBILIARIA_OVERRIDES: CategoryOverrides = {
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

const LOJA_ROUPAS_OVERRIDES: CategoryOverrides = {
  endereco: {
    contentPlaceholder: 'Ex.: Rua Batista de Carvalho, 500 – Centro, Bauru/SP. Ao lado da farmácia…',
  },
  pagamento: {
    hint: 'Pix, cartão, parcelamento, crediário, descontos à vista.',
    titlePlaceholder: 'Ex.: Parcelamento',
    contentPlaceholder: 'Ex.: Pix com 5% de desconto. Cartão em até 6x sem juros (parcela mínima R$ 50).',
  },
  outros: {
    hint: 'Qualquer dúvida recorrente dos clientes.',
    titlePlaceholder: 'Ex.: Têm provador?',
    contentPlaceholder: 'Ex.: Sim, temos provadores e você pode separar peças para provar na loja.',
  },
}

const TEMPLATE_OVERRIDES: Record<BusinessTemplate, CategoryOverrides> = {
  clinica: {},
  imobiliaria: IMOBILIARIA_OVERRIDES,
  loja_roupas: LOJA_ROUPAS_OVERRIDES,
}

export function knowledgeCategoriesFor(
  template: BusinessTemplate | string | null | undefined,
): KnowledgeCategoryMeta[] {
  const resolved = resolveBusinessTemplate(template)
  const allowed = TEMPLATE_CATEGORIES[resolved]
  const overrides = TEMPLATE_OVERRIDES[resolved]
  return KNOWLEDGE_CATEGORIES.filter((category) => allowed.includes(category.value)).map(
    (category) => ({ ...category, ...overrides[category.value] }),
  )
}
