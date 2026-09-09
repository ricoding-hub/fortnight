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
