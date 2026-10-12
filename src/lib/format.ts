import { parseISO, format, isToday, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'

const mxnFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
})

/** Formats a number as Mexican pesos, e.g. 1234.5 -> "$1,234.50". */
export function formatMXN(amount: number): string {
  return mxnFormatter.format(amount)
}

/**
 * Formats a date as a short Spanish string, e.g. "14 de may. 2026".
 * Accepts a Date or an ISO string (date-only strings are parsed as local time).
 */
export function formatDateMX(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, "d 'de' MMM yyyy", { locale: es })
}

/**
 * Header label for a group of transactions sharing a date:
 * "Hoy", "Ayer", "12 de may" (current year) or "12 de may 2025" otherwise.
 */
export function formatDateGroupMX(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  if (isToday(d)) return 'Hoy'
  if (isYesterday(d)) return 'Ayer'
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return format(d, sameYear ? "d 'de' MMM" : "d 'de' MMM yyyy", { locale: es })
}

/** Month and year, e.g. "ago 2026". */
export function formatMonthMX(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'LLL yyyy', { locale: es })
}

/**
 * «Ana», «Ana y Luis», «Ana, Luis y 2 más». Para listas cortas de personas en
 * una línea: después de `max` nombres sólo se cuenta el resto.
 */
export function enumerarNombres(nombres: readonly string[], max = 2): string {
  const limpios = nombres.map((n) => n.trim()).filter(Boolean)
  if (limpios.length <= 1) return limpios[0] ?? ''
  if (limpios.length <= max) {
    return `${limpios.slice(0, -1).join(', ')} y ${limpios[limpios.length - 1]}`
  }
  const resto = limpios.length - max
  return `${limpios.slice(0, max).join(', ')} y ${resto} más`
}
