/**
 * Pay-frequency helpers — port of design_handoff_fortnight_redesign/design-files/shared.jsx.
 *
 * All Date operations use local time (no UTC normalisation) so a payday on the
 * 15th renders as the 15th regardless of timezone. Callers should pass dates
 * constructed from local-time fields (no `Z` suffix) to avoid drift.
 */

export type PayFreq = 'semanal' | 'catorcenal' | 'quincenal' | 'mensual'

export const PAY_FREQS = {
  semanal:    { label: 'Semanal',    cyclesPerMonth: 4,    cyclesPerYear: 52, stepDays: 7 },
  catorcenal: { label: 'Catorcenal', cyclesPerMonth: 2.17, cyclesPerYear: 26, stepDays: 14 },
  quincenal:  { label: 'Quincenal',  cyclesPerMonth: 2,    cyclesPerYear: 24, stepDays: 15 },
  mensual:    { label: 'Mensual',    cyclesPerMonth: 1,    cyclesPerYear: 12, stepDays: 30 },
} as const

/**
 * Convierte lo que venga de la base de datos en una frecuencia válida.
 *
 * `pay_freq` es una columna de texto, así que el valor puede ser cualquier cosa:
 * una frecuencia que se añada más adelante y llegue a un cliente viejo, una
 * fila migrada a mano, un nulo. Media app hacía `(config?.pay_freq ?? 'catorcenal')
 * as PayFreq` y luego `PAY_FREQS[freq].cyclesPerMonth`, y ese `as` no comprueba
 * nada: con un valor desconocido `PAY_FREQS[freq]` es undefined y leer
 * `.cyclesPerMonth` revienta al dibujar. Una pantalla en blanco por un dato,
 * no por un error de lógica. Aquí se comprueba de verdad.
 */
export function payFreqOf(value: unknown): PayFreq {
  return typeof value === 'string' && value in PAY_FREQS ? (value as PayFreq) : 'catorcenal'
}

const MONTHS_ES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'] as const

/** Returns a new Date pinned to local 12:00 — avoids DST/midnight off-by-one drift. */
function noon(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0)
}

/** True if `a` and `b` fall on the same calendar day in local time. */
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Computes the next `count` paydays at-or-after `today`.
 *
 * For `quincenal`: derives two days-of-month from the reference (mirrored
 *   across the 15th) and yields each occurrence walking month by month.
 * For other frequencies: steps from `reference` by `stepDays` until reaching
 *   `today`, then yields `count` consecutive steps.
 */
export function computePaydays(
  reference: Date,
  freq: PayFreq,
  count = 6,
  today: Date = new Date(),
): Date[] {
  if (!(reference instanceof Date) || isNaN(reference.getTime())) return []
  const ref = noon(reference)
  const t = noon(today)
  const out: Date[] = []

  if (freq === 'quincenal') {
    const startDay = ref.getDate()
    const otherDay =
      startDay <= 15
        ? Math.min(startDay + 15, 31)
        : Math.max(startDay - 15, 1)
    const days = Array.from(new Set([startDay, otherDay])).sort((a, b) => a - b)

    let y = t.getFullYear()
    let m = t.getMonth()
    while (out.length < count) {
      for (const d of days) {
        const lastDayOfMonth = new Date(y, m + 1, 0).getDate()
        const real = Math.min(d, lastDayOfMonth)
        const dt = new Date(y, m, real, 12, 0, 0, 0)
        if (dt >= t) out.push(dt)
        if (out.length >= count) break
      }
      m++
      if (m > 11) { m = 0; y++ }
    }
    return out.slice(0, count)
  }

  const stepDays = PAY_FREQS[payFreqOf(freq)].stepDays
  const cur = new Date(ref)
  while (cur < t) cur.setDate(cur.getDate() + stepDays)
  // `cur` is now the soonest payday >= today (includes today if it's an exact payday).

  for (let i = 0; i < count; i++) {
    const d = new Date(cur)
    d.setDate(d.getDate() + i * stepDays)
    out.push(d)
  }
  return out
}

/** True iff `today` is one of the paydays scheduled from `reference` at `freq`. */
export function isPayday(
  reference: Date,
  freq: PayFreq,
  today: Date = new Date(),
): boolean {
  const next = computePaydays(reference, freq, 1, today)
  if (!next.length) return false
  return sameDay(next[0], today)
}

/** Short Spanish payday label, e.g. "15 may". */
export function fmtPayday(d: Date): string {
  return `${d.getDate()} ${MONTHS_ES[d.getMonth()]}`
}
