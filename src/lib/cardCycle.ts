import { addDays, dayInMonth, noon } from '@/lib/localDate'
import type { Account } from '@/types'

/**
 * El ciclo de una tarjeta: cuándo corta y cuándo hay que pagar.
 *
 * Un solo lugar para esta cuenta, que antes vivía repetida en `calendar.ts` y
 * `dates.ts` con dos fallas:
 * - con días de gracia largos (Plata: 60) el calendario perdía fechas de pago,
 *   porque sólo miraba el corte del mes anterior;
 * - `daysUntilPayment`, en modo gracia, saltaba al corte de DOS meses después
 *   cuando la fecha del ciclo actual ya había pasado.
 *
 * Todo es a mediodía local (ver `localDate.ts`).
 */
export type CicloTarjeta = Pick<Account, 'type' | 'cut_day' | 'payment_due_day' | 'payment_grace_days'>

/** Sin regla de pago, se estima: la mayoría de las tarjetas da unos 20 días. */
export const DIAS_PAGO_SUPUESTOS = 20

export interface Vencimiento {
  /** Corte del estado de cuenta que se paga; null si la tarjeta no tiene corte. */
  corte: Date | null
  vence: Date
  /** La fecha de pago es una estimación (no hay regla configurada). */
  estimado: boolean
}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function corteDia(c: CicloTarjeta): number | null {
  const d = num(c.cut_day)
  return d != null && d >= 1 && d <= 31 ? d : null
}
function gracia(c: CicloTarjeta): number | null {
  const g = num(c.payment_grace_days)
  return g != null && g >= 1 ? g : null
}
function diaDePago(c: CicloTarjeta): number | null {
  const d = num(c.payment_due_day)
  return d != null && d >= 1 && d <= 31 ? d : null
}

/** El corte de ese mes (día recortado al largo del mes). */
export function corteEn(c: CicloTarjeta, year: number, month: number): Date | null {
  const dia = corteDia(c)
  return dia == null ? null : dayInMonth(year, month, dia)
}

/** El corte en el que entra una compra hecha en `fecha`: el mismo día cuenta. */
export function primerCorteDesde(c: CicloTarjeta, fecha: Date): Date | null {
  const f = noon(fecha)
  const este = corteEn(c, f.getFullYear(), f.getMonth())
  if (este == null) return null
  return f <= este ? este : corteEn(c, f.getFullYear(), f.getMonth() + 1)
}

/** `k` cortes después de `corte`, recortando desde `cut_day` cada vez (31 → 28 feb → 31 mar). */
export function corteMas(c: CicloTarjeta, corte: Date, k: number): Date | null {
  return corteEn(c, corte.getFullYear(), corte.getMonth() + k)
}

/** Fecha límite de pago del estado de cuenta que corta en `corte`. */
export function venceDelCorte(c: CicloTarjeta, corte: Date): { vence: Date; estimado: boolean } {
  const g = gracia(c)
  if (g != null) return { vence: addDays(corte, g), estimado: false }
  const dia = diaDePago(c)
  if (dia != null) {
    // El primer día de pago estrictamente después del corte.
    const mismoMes = dayInMonth(corte.getFullYear(), corte.getMonth(), dia)
    const vence = mismoMes > corte ? mismoMes : dayInMonth(corte.getFullYear(), corte.getMonth() + 1, dia)
    return { vence, estimado: false }
  }
  return { vence: addDays(corte, DIAS_PAGO_SUPUESTOS), estimado: true }
}

/** ¿La tarjeta tiene alguna regla de pago configurada? */
export function tieneVencimiento(c: CicloTarjeta | null | undefined): boolean {
  if (!c || c.type !== 'credit') return false
  return (gracia(c) != null && corteDia(c) != null) || diaDePago(c) != null
}

/**
 * Fechas de pago entre `from` y `to` (inclusive), con su corte cuando lo hay.
 * Las estimadas (sin regla de pago) sólo salen si se piden.
 */
export function vencimientosEntre(
  c: CicloTarjeta,
  from: Date,
  to: Date,
  opciones: { estimados?: boolean } = {},
): Vencimiento[] {
  if (c.type !== 'credit') return []
  const inicio = noon(from)
  const fin = noon(to)
  const out: Vencimiento[] = []

  if (corteDia(c) != null && (gracia(c) != null || diaDePago(c) != null || opciones.estimados)) {
    // Arranca lo bastante atrás para alcanzar cortes cuyo pago cae en el rango
    // aunque la gracia sea larga.
    const margen = (gracia(c) ?? 31) + 31
    const atras = addDays(inicio, -margen)
    for (let i = 0; i < 400; i++) {
      const corte = corteEn(c, atras.getFullYear(), atras.getMonth() + i)
      if (!corte) break
      const { vence, estimado } = venceDelCorte(c, corte)
      if (estimado && !opciones.estimados) break
      if (vence > fin) break
      if (vence >= inicio) out.push({ corte, vence, estimado })
    }
    return out
  }

  const dia = diaDePago(c)
  if (dia == null) return []
  for (let i = 0; i < 400; i++) {
    const vence = dayInMonth(inicio.getFullYear(), inicio.getMonth() + i, dia)
    if (vence > fin) break
    if (vence >= inicio) out.push({ corte: null, vence, estimado: false })
  }
  return out
}

/** La siguiente fecha de pago en o después de `hoy`. */
export function proximoVencimiento(c: CicloTarjeta, hoy: Date): Vencimiento | null {
  if (!tieneVencimiento(c)) return null
  const h = noon(hoy)
  return vencimientosEntre(c, h, addDays(h, 400))[0] ?? null
}
