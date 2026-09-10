import {
  IconCash, IconCreditCard, IconScissors, IconRepeat, IconStack2, IconTarget,
  IconArrowsExchange, type Icon,
} from '@tabler/icons-react'
import type { CalendarEventKind } from '@/lib/calendar'

/**
 * One place deciding how each event kind looks, so the grid dots, the day
 * detail and the Home summary can never disagree about what a colour means.
 * Colours follow the app's semantics: asset = money in, debt = money out,
 * peach = heads-up, lavender = meta, primary = informational.
 */
export interface EventStyle {
  label: string
  icon: Icon
  /** Hex, used for dots and for `${hex}18` tinted surfaces. */
  hex: string
  /** Soft chip pair, matching the Badge convention. */
  chip: string
}

export const EVENT_STYLE: Record<CalendarEventKind, EventStyle> = {
  payday: { label: 'Te pagan', icon: IconCash, hex: '#2BB673', chip: 'bg-asset-soft text-asset-deep' },
  card_due: { label: 'Pago de tarjeta', icon: IconCreditCard, hex: '#FF5A5F', chip: 'bg-debt-soft text-debt-deep' },
  card_cut: { label: 'Corte', icon: IconScissors, hex: '#FFB59E', chip: 'bg-peach-soft text-peach-deep' },
  subscription: { label: 'Suscripción', icon: IconRepeat, hex: '#2A4BFF', chip: 'bg-primary-soft text-primary-deep' },
  installment: { label: 'Mensualidad', icon: IconStack2, hex: '#9B7BFF', chip: 'bg-lavender-soft text-lavender-deep' },
  goal: { label: 'Meta', icon: IconTarget, hex: '#9B7BFF', chip: 'bg-lavender-soft text-lavender-deep' },
  transaction: { label: 'Movimiento', icon: IconArrowsExchange, hex: '#8E91A4', chip: 'bg-bg-secondary text-text-secondary' },
}

/** Order used wherever events are listed, most consequential first. */
export const KIND_ORDER: CalendarEventKind[] = [
  'payday', 'card_due', 'card_cut', 'subscription', 'installment', 'goal', 'transaction',
]

/**
 * What earns the cell its colour. A payday, a cut and a payment deadline are
 * the dates the month is actually planned around; a subscription charge or a
 * past movement is context. Mixing both into one background made a movement
 * look as consequential as a due date.
 */
export const PRIMARY_KINDS: CalendarEventKind[] = ['card_due', 'payday', 'card_cut']

/** Ordered by consequence: a deadline can be missed, a cut cannot. */
export function dominantPrimary(kinds: Iterable<CalendarEventKind>): CalendarEventKind | null {
  const present = new Set(kinds)
  for (const k of PRIMARY_KINDS) if (present.has(k)) return k
  return null
}

export function isPrimary(kind: CalendarEventKind): boolean {
  return PRIMARY_KINDS.includes(kind)
}

/** Cell treatment per primary kind: soft ground + deep text, as Badge does. */
export const PRIMARY_CELL: Record<string, { bg: string; text: string; ring: string }> = {
  card_due: { bg: 'bg-debt-soft', text: 'text-debt-deep', ring: 'ring-debt/45' },
  payday: { bg: 'bg-asset-soft', text: 'text-asset-deep', ring: 'ring-asset/45' },
  card_cut: { bg: 'bg-peach-soft', text: 'text-peach-deep', ring: 'ring-peach/50' },
}
