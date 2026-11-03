import { api, toApiError } from '@/api/client'
import type { DataResponse } from '@/api/crm/types'

export type PropertyDealType = 'aluguel' | 'compra'
export type PropertyType = 'residencial' | 'apartamento' | 'comercial' | 'rural'

export type ClinicProperty = {
  id: number
  clinic_id: number
  title: string | null
  image_path: string | null
  image_url: string | null
  address: string
  price: string | number
  deal_type: PropertyDealType
  property_type: PropertyType
  active: boolean
  created_at: string
  updated_at: string
}

export const PROPERTY_DEAL_TYPE_LABELS: Record<PropertyDealType, string> = {
  aluguel: 'Aluguel',
  compra: 'Compra',
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  residencial: 'Residencial',
  apartamento: 'Apartamento',
  comercial: 'Comercial',
  rural: 'Rural',
}

type PropertiesListResponse = {
  data: ClinicProperty[]
}

function appendPropertyForm(
  payload: {
    title?: string | null
    address?: string
    price?: number
    deal_type?: PropertyDealType
    property_type?: PropertyType
    active?: boolean
    image?: File | null
    remove_image?: boolean
  },
): FormData {
  const form = new FormData()
  if (payload.title !== undefined) form.append('title', payload.title ?? '')
  if (payload.address !== undefined) form.append('address', payload.address)
  if (payload.price !== undefined) form.append('price', String(payload.price))
  if (payload.deal_type !== undefined) form.append('deal_type', payload.deal_type)
  if (payload.property_type !== undefined) form.append('property_type', payload.property_type)
  if (payload.active !== undefined) form.append('active', payload.active ? '1' : '0')
  if (payload.image) form.append('image', payload.image)
  if (payload.remove_image) form.append('remove_image', '1')
  return form
}

export async function listProperties(params?: { q?: string }): Promise<ClinicProperty[]> {
  try {
    const { data } = await api.get<PropertiesListResponse>('/v1/crm/properties', {
      params: params?.q ? { q: params.q } : undefined,
    })
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function createProperty(payload: {
  title?: string | null
  address: string
  price: number
  deal_type: PropertyDealType
  property_type: PropertyType
  active?: boolean
  image?: File | null
}): Promise<ClinicProperty> {
  try {
    const { data } = await api.post<DataResponse<ClinicProperty>>(
      '/v1/crm/properties',
      appendPropertyForm(payload),
    )
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function updateProperty(
  id: number,
  payload: {
    title?: string | null
    address?: string
    price?: number
    deal_type?: PropertyDealType
    property_type?: PropertyType
    active?: boolean
    image?: File | null
    remove_image?: boolean
  },
): Promise<ClinicProperty> {
  try {
    const form = appendPropertyForm(payload)
    form.append('_method', 'PATCH')
    const { data } = await api.post<DataResponse<ClinicProperty>>(
      `/v1/crm/properties/${id}`,
      form,
    )
    return data.data
  } catch (error) {
    throw toApiError(error)
  }
}

export async function deleteProperty(id: number): Promise<void> {
  try {
    await api.delete(`/v1/crm/properties/${id}`)
  } catch (error) {
    throw toApiError(error)
  }
}
