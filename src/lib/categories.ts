import {
  IconHome,
  IconBolt,
  IconRepeat,
  IconToolsKitchen2,
  IconUsers,
  IconCar,
  IconHeartbeat,
  IconDots,
  IconCash,
  IconTicket,
  IconGift,
  IconCategory,
  type Icon,
} from '@tabler/icons-react'
import type { Category, CategoryKind } from '@/types'

// Seeded categories carry no icon in the DB, so map by name. A category the
// user renames or adds later falls back to the generic icon.
const ICON_BY_NAME: Record<string, Icon> = {
  Renta: IconHome,
  Servicios: IconBolt,
  Suscripciones: IconRepeat,
  Comida: IconToolsKitchen2,
  Social: IconUsers,
  Transporte: IconCar,
  Salud: IconHeartbeat,
  Otros: IconDots,
  Salario: IconCash,
  Vales: IconTicket,
  Extra: IconGift,
}

// Chip tint by kind: income emerald, fixed indigo, variable amber.
const COLOR_BY_KIND: Record<CategoryKind, string> = {
  fixed: '#6366F1',
  variable: '#F59E0B',
  income: '#10B981',
}

export const KIND_LABEL: Record<CategoryKind, string> = {
  income: 'Ingresos',
  fixed: 'Fijos',
  variable: 'Variables',
}

/** Display order for grouped category lists. */
export const KIND_ORDER: CategoryKind[] = ['income', 'fixed', 'variable']

export function categoryIcon(category: Category | null | undefined): Icon {
  if (!category) return IconCategory
  return ICON_BY_NAME[category.name] ?? IconCategory
}

export function categoryColor(category: Category | null | undefined): string {
  if (!category) return '#6b6375'
  return category.color ?? COLOR_BY_KIND[category.kind]
}
