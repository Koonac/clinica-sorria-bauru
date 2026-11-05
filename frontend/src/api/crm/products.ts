import { api, toApiError } from '@/api/client'
import type { DataResponse } from '@/api/crm/types'

export type ProductCategory =
  | 'camiseta'
  | 'camisa'
  | 'blusa'
  | 'calca'
  | 'bermuda_short'
  | 'vestido'
  | 'saia'
  | 'casaco_jaqueta'
  | 'moda_intima'
  | 'calcado'
  | 'acessorio'
  | 'outros'

export type ProductAudience = 'feminino' | 'masculino' | 'unissex' | 'infantil'

/** Espelha ClinicProduct::SIZES (backend), na ordem de exibição. */
export const PRODUCT_SIZES = [
  'PP',
  'P',
  'M',
  'G',
  'GG',
  'XG',
  '34',
  '36',
  '38',
  '40',
  '42',
  '44',
  '46',
  '48',
  'UNICO',
] as const

export type ProductSize = (typeof PRODUCT_SIZES)[number]

export type ClinicProduct = {
  id: number
  clinic_id: number
  name: string
  description: string | null
  image_path: string | null
  image_url: string | null
  price: string | number
  category: ProductCategory
  audience: ProductAudience
  sizes: ProductSize[]
  colors: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  camiseta: 'Camiseta',
  camisa: 'Camisa',
  blusa: 'Blusa',
  calca: 'Calça',
  bermuda_short: 'Bermuda / short',
  vestido: 'Vestido',
  saia: 'Saia',
  casaco_jaqueta: 'Casaco / jaqueta',
  moda_intima: 'Moda íntima',
  calcado: 'Calçado',
  acessorio: 'Acessório',
  outros: 'Outros',
}

export const PRODUCT_AUDIENCE_LABELS: Record<ProductAudience, string> = {
  feminino: 'Feminino',
  masculino: 'Masculino',
  unissex: 'Unissex',
  infantil: 'Infantil',
}

export function productSizeLabel(size: ProductSize): string {
  return size === 'UNICO' ? 'Único' : size
}

export type ProductPayload = {
  name?: string
  description?: string | null
  price?: number
  category?: ProductCategory
  audience?: ProductAudience
  sizes?: ProductSize[]
  colors?: string | null
  active?: boolean
  image?: File | null
  remove_image?: boolean
}

function appendProductForm(payload: ProductPayload): FormData {
  const form = new FormData()
  if (payload.name !== undefined) form.append('name', payload.name)
  if (payload.description !== undefined) form.append('description', payload.description ?? '')
  if (payload.price !== undefined) form.append('price', String(payload.price))
  if (payload.category !== undefined) form.append('category', payload.category)
  if (payload.audience !== undefined) form.append('audience', payload.audience)
  if (payload.sizes !== undefined) {
    // FormData não envia array vazio: sizes="" significa "nenhum tamanho".
    if (payload.sizes.length === 0) form.append('sizes', '')
    else payload.sizes.forEach((size) => form.append('sizes[]', size))
  }
  if (payload.colors !== undefined) form.append('colors', payload.colors ?? '')
  if (payload.active !== undefined) form.append('active', payload.active ? '1' : '0')
  if (payload.image) form.append('image', payload.image)
  if (payload.remove_image) form.append('remove_image', '1')
  return form
}

export async function listProducts(params?: { q?: string }): Promise<ClinicProduct[]> {
  try {
    const { data } = await api.get<{ data: ClinicProduct[] }>('/v1/crm/products', {
      params: params?.q ? { q: params.q } : undefined,
    })
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function createProduct(
  payload: ProductPayload & {
    name: string
    price: number
    category: ProductCategory
    audience: ProductAudience
  },
): Promise<ClinicProduct> {
  try {
    const { data } = await api.post<DataResponse<ClinicProduct>>(
      '/v1/crm/products',
      appendProductForm(payload),
    )
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function updateProduct(id: number, payload: ProductPayload): Promise<ClinicProduct> {
  try {
    const form = appendProductForm(payload)
    form.append('_method', 'PATCH')
    const { data } = await api.post<DataResponse<ClinicProduct>>(`/v1/crm/products/${id}`, form)
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function deleteProduct(id: number): Promise<void> {
  try {
    await api.delete(`/v1/crm/products/${id}`)
  } catch (error) {
    throw toApiError(error)
  }
}
