import type { KnowledgeCategory } from '@/api/crm/knowledge'

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
    value: 'horarios',
    label: 'Horários de funcionamento',
    icon: 'lucide:clock',
    hint: 'Dias e horários de atendimento, feriados, intervalo de almoço.',
    titlePlaceholder: 'Ex.: Segunda a sexta',
    contentPlaceholder: 'Ex.: Segunda a sexta, das 8h às 18h. Sábados das 8h às 12h.',
  },
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
