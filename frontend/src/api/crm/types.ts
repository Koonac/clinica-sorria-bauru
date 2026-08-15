export type PipelineKind = 'lead' | 'deal'
export type StageStatus = 'open' | 'in_progress' | 'won' | 'lost'
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'unqualified' | 'converted'
export type ActivityType = 'note' | 'call' | 'whatsapp' | 'email' | 'task' | 'stage_change'

export type CrmUserRef = {
  id: number
  name: string
}

export type Source = {
  id: number
  name: string
  slug?: string | null
}

export type Organization = {
  id: number
  name: string
}

export type Contact = {
  id: number
  name: string
  email?: string | null
  mobile?: string | null
  whatsapp_jid?: string | null
  organization_id?: number | null
  organization?: Organization | null
}

export type PipelineStage = {
  id: number
  kind: PipelineKind
  slug: string
  name: string
  color: string | null
  position: number
  is_open: boolean
  is_in_progress: boolean
  is_won: boolean
  is_lost: boolean
  active: boolean
  leads?: Lead[]
  deals?: Deal[]
}

export type CrmTask = {
  id: number
  title: string
  description?: string | null
  due_at: string
  done_at?: string | null
  lead_id?: number | null
  deal_id?: number | null
  user_id?: number | null
  user?: CrmUserRef | null
  lead?: { id: number; name: string } | null
  deal?: { id: number; title: string } | null
}

export type Activity = {
  id: number
  type: ActivityType
  subject?: string | null
  body?: string | null
  due_at?: string | null
  done_at?: string | null
  lead_id?: number | null
  deal_id?: number | null
  contact_id?: number | null
  user_id?: number | null
  meta?: Record<string, unknown> | null
  created_at?: string
  user?: CrmUserRef | null
}

export type WhatsappAttendanceSegment = {
  id: number
  lead_id: number
  mode: 'ai' | 'human'
  user_id?: number | null
  started_at: string
  ended_at?: string | null
  duration_seconds?: number | null
  source?: string | null
  user?: CrmUserRef | null
}

export type Lead = {
  id: number
  title: string
  status: LeadStatus
  stage_id: number | null
  name: string
  email?: string | null
  mobile?: string | null
  whatsapp_jid?: string | null
  instagram?: string | null
  organization_name?: string | null
  contact_id?: number | null
  organization_id?: number | null
  owner_id?: number | null
  source_id?: number | null
  value?: string | number | null
  currency?: string | null
  lost_reason?: string | null
  whatsapp_agent_paused_at?: string | null
  whatsapp_agent_resume_at?: string | null
  whatsapp_conversation_closed_at?: string | null
  whatsapp_conversation_closed_by?: number | null
  whatsapp_auto_close_at?: string | null
  converted_deal_id?: number | null
  converted_at?: string | null
  created_at?: string
  updated_at?: string
  contact?: Contact | null
  organization?: Organization | null
  owner?: CrmUserRef | null
  source?: Source | null
  stage?: PipelineStage | null
  activities?: Activity[]
  attendance_segments?: WhatsappAttendanceSegment[]
  tasks?: CrmTask[]
  next_pending_task?: CrmTask | null
}

export type Deal = {
  id: number
  title: string
  lead_id?: number | null
  contact_id: number
  organization_id?: number | null
  owner_id?: number | null
  source_id?: number | null
  whatsapp_jid?: string | null
  stage_id: number
  value?: string | number | null
  currency?: string | null
  probability?: number | null
  expected_close_on?: string | null
  closed_at?: string | null
  lost_reason?: string | null
  lost_notes?: string | null
  created_at?: string
  updated_at?: string
  contact?: Contact | null
  organization?: Organization | null
  owner?: CrmUserRef | null
  source?: Source | null
  stage?: PipelineStage | null
  activities?: Activity[]
  tasks?: CrmTask[]
  next_pending_task?: CrmTask | null
}

export type LeadsPorDiaPoint = {
  date: string
  total: number
}

export type WhatsappMessage = {
  id: number
  direction: 'in' | 'out' | 'inbound' | 'outbound' | string
  body?: string | null
  has_media?: boolean
  whatsapp_jid: string
  contact_name?: string | null
  wa_timestamp?: string | null
  created_at?: string
  lead_id?: number | null
  deal_id?: number | null
  user_id?: number | null
}

export type WhatsappChatFilter = 'all' | 'mine' | 'unassigned' | 'unread' | 'human' | 'agent'


export type WhatsappChat = {
  whatsapp_jid: string
  whatsapp_lid?: string | null
  phone_number?: string | null
  contact_name?: string | null
  conversation_key?: string
  lead_id?: number | null
  deal_id?: number | null
  contact_id?: number | null
  avatar_url?: string | null
  owner_id?: number | null
  owner_name?: string | null
  whatsapp_agent_paused_at?: string | null
  whatsapp_agent_resume_at?: string | null
  whatsapp_conversation_closed_at?: string | null
  unread_count: number
  last_message: {
    id: number
    body?: string | null
    direction: string
    has_media: boolean
    wa_timestamp?: string | null
    created_at?: string | null
  }
}

export type CrmAttendant = {
  id: number
  name: string
}

export type CreateLeadPayload = {
  name: string
  title?: string
  status?: Exclude<LeadStatus, 'converted'>
  email?: string | null
  mobile?: string | null
  whatsapp_jid?: string | null
  instagram?: string | null
  organization_name?: string | null
  source_id?: number | null
  value?: number | null
  currency?: string
  stage_id?: number | null
}

export type UpdateLeadPayload = Partial<
  Omit<CreateLeadPayload, 'status'> & {
    status?: Exclude<LeadStatus, 'converted'>
    lost_reason?: string | null
    owner_id?: number | null
  }
>

export type MoveLeadPayload = {
  stage_id: number
  lost_reason?: string
}

export type ConvertLeadPayload = {
  title?: string
  stage_id?: number
  value?: number
  owner_id?: number
}

export type UpdateDealPayload = {
  title?: string
  contact_id?: number
  stage_id?: number
  organization_id?: number | null
  owner_id?: number | null
  source_id?: number | null
  value?: number | null
  currency?: string
  probability?: number | null
  expected_close_on?: string | null
  lost_reason?: string | null
  lost_notes?: string | null
}

export type CreateStagePayload = {
  kind: PipelineKind
  name: string
  color?: string
  status?: StageStatus
  slug?: string
}

export type UpdateStagePayload = {
  name?: string
  color?: string | null
  status?: StageStatus
}

export type CreateTaskPayload = {
  title: string
  description?: string | null
  due_at: string
  lead_id?: number | null
  deal_id?: number | null
}

export type UpdateTaskPayload = {
  title?: string
  description?: string | null
  due_at?: string
  done?: boolean
}

export type CreateActivityPayload = {
  type: ActivityType
  subject?: string | null
  body?: string | null
  lead_id?: number | null
  deal_id?: number | null
  contact_id?: number | null
}

export type Paginated<T> = {
  data: T[]
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export type DataResponse<T> = {
  data: T
}

export function stageStatus(stage: Pick<PipelineStage, 'is_open' | 'is_in_progress' | 'is_won' | 'is_lost'>): StageStatus {
  if (stage.is_won) return 'won'
  if (stage.is_lost) return 'lost'
  if (stage.is_in_progress) return 'in_progress'
  return 'open'
}

export function isTerminalStage(stage: Pick<PipelineStage, 'is_won' | 'is_lost'>): boolean {
  return Boolean(stage.is_won || stage.is_lost)
}

export function formatMoney(value: string | number | null | undefined, currency = 'BRL'): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return 'R$ 0,00'
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(n)
  } catch {
    return `R$ ${n.toFixed(2)}`
  }
}
