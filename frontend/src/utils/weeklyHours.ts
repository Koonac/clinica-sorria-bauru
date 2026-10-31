import type { BusinessHours } from '@/api/clinics'

export type WeekDayKey = keyof BusinessHours

export const WEEK_DAYS: { key: WeekDayKey; short: string; long: string }[] = [
  { key: '1', short: 'Seg', long: 'Segunda' },
  { key: '2', short: 'Ter', long: 'Terça' },
  { key: '3', short: 'Qua', long: 'Quarta' },
  { key: '4', short: 'Qui', long: 'Quinta' },
  { key: '5', short: 'Sex', long: 'Sexta' },
  { key: '6', short: 'Sáb', long: 'Sábado' },
  { key: '7', short: 'Dom', long: 'Domingo' },
]

export function isValidRange(
  range: { start: string; end: string },
  allowOvernight = false,
): boolean {
  if (!range.start || !range.end) return false
  return allowOvernight ? range.start !== range.end : range.end > range.start
}

export function isValidWeek(hours: BusinessHours, allowOvernight = false): boolean {
  return Object.values(hours).every((range) => isValidRange(range, allowOvernight))
}
