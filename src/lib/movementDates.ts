import { toKey } from '@/lib/calendar'

/**
 * Fechas de un movimiento: el día EN QUE OCURRIÓ y el día EN QUE SE REGISTRÓ.
 *
 * Son dos cosas distintas y la pantalla las confundía. Un gasto del 29 de
 * septiembre que se anota el 4 de octubre se ordena y se agrupa por el 29 —
 * cuándo lo gastaste —, y avisa en pequeño que se registró el 4 — cuándo lo
 * anotaste —. Antes sólo había una fecha, y el formulario ni dejaba elegirla.
 *
 * Todo con días LOCALES. `created_at` llega en UTC: tomarlo con
 * `toISOString().slice(0, 10)` mueve de día a quien registra de noche en CDMX
 * (23:30 locales ya son el día siguiente en UTC), que es exactamente el error
 * que esta función existe para no cometer.
 */

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const
const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

/** `YYYY-MM-DD` → Date a mediodía local (el idioma de la casa contra el DST). */
function deClave(clave: string): Date {
  const [y, m, d] = clave.slice(0, 10).split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0)
}

/** Día local `YYYY-MM-DD` de un timestamp (o de una fecha ya en ese formato). */
export function diaLocal(valor: string | Date): string {
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor
  return toKey(typeof valor === 'string' ? new Date(valor) : valor)
}

/**
 * ¿Se registró otro día que el del gasto? Devuelve el día de registro
 * (`YYYY-MM-DD`) cuando difiere, o null cuando coinciden.
 */
export function registroDistinto(fechaGasto: string, creadoEn: string): string | null {
  const gasto = diaLocal(fechaGasto)
  const registro = diaLocal(creadoEn)
  return gasto === registro ? null : registro
}

/** «4 oct», o «4 oct 2025» si no es de este año. */
export function fechaCorta(clave: string, hoy: Date = new Date()): string {
  const d = deClave(clave)
  const base = `${d.getDate()} ${MESES[d.getMonth()]}`
  return d.getFullYear() === hoy.getFullYear() ? base : `${base} ${d.getFullYear()}`
}

/**
 * Cabecera de un día en una lista: «Hoy», «Ayer», «Lun 29 sep».
 * Compara por día local, no por diferencia de milisegundos: a las 00:10 «ayer»
 * son 10 minutos atrás, no 24 horas.
 */
export function etiquetaDia(clave: string, hoy: Date = new Date()): string {
  const d = deClave(clave)
  const h = deClave(toKey(hoy))
  const dias = Math.round((h.getTime() - d.getTime()) / 86_400_000)
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  const dia = DIAS[d.getDay()]
  const mayus = dia[0].toUpperCase() + dia.slice(1)
  return `${mayus} ${fechaCorta(clave, hoy)}`
}

/**
 * Todas las formas en que alguien podría escribir esa fecha en un buscador:
 * «23 sep», «23 septiembre», «23/09», «2026-09-23», «sep», «lun».
 */
export function textoDeFecha(clave: string): string {
  const d = deClave(clave)
  const dd = String(d.getDate())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return [
    `${dd} ${MESES[d.getMonth()]}`,
    `${dd} ${MESES_LARGOS[d.getMonth()]}`,
    `${dd.padStart(2, '0')}/${mm}`,
    clave.slice(0, 10),
    DIAS[d.getDay()],
    String(d.getFullYear()),
  ].join(' ')
}
