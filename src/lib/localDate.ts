/**
 * Fechas en días locales. Viven aquí, sin dependencias, para que `calendar.ts`,
 * `cardCycle.ts` y `msi.ts` las compartan sin importarse en círculo.
 * `calendar.ts` las reexporta: la regla de la casa sigue siendo «usa
 * `toKey`/`fromKey`, nunca `toISOString().slice(0, 10)`».
 */

/** Local noon, so DST can never shift the calendar day. */
export function noon(d: Date): Date {
  const c = new Date(d)
  c.setHours(12, 0, 0, 0)
  return c
}

/** Local `YYYY-MM-DD` — never via toISOString, which is UTC. */
export function toKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0)
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Clamps a day-of-month to a real day (31 → 30 in November). */
export function dayInMonth(year: number, month: number, day: number): Date {
  return new Date(year, month, Math.min(day, lastDayOfMonth(year, month)), 12, 0, 0, 0)
}

/** `d` + `n` días, a mediodía local. */
export function addDays(d: Date, n: number): Date {
  const c = noon(d)
  c.setDate(c.getDate() + n)
  return c
}
