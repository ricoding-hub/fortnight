import { supabase } from '@/lib/supabase'

/**
 * ¿Ya se corrieron las migraciones que cambian cómo se escribe?
 *
 * Sin ellas la app funciona igual al leer; algunas escrituras usan el camino
 * viejo, que también es correcto. Se pregunta una vez por sesión. Un error que
 * no sea «columna inexistente» no se recuerda: se vuelve a preguntar la próxima
 * vez, y mientras tanto se usa el camino viejo.
 */
const respuestas = new Map<string, Promise<boolean>>()

/** «Esa columna no existe»: la migración no se ha corrido. */
export function esColumnaFaltante(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204'
}

/** «Esa tabla no existe»: la migración no se ha corrido. */
export function esTablaFaltante(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

function sondear(clave: string, tabla: string, columna: string): Promise<boolean> {
  const previa = respuestas.get(clave)
  if (previa) return previa
  const intento = (async () => {
    const { error } = await supabase.from(tabla).select(columna).limit(0)
    if (!error) return true
    if (esColumnaFaltante(error) || esTablaFaltante(error)) return false
    respuestas.delete(clave)
    return false
  })()
  respuestas.set(clave, intento)
  return intento
}

/** Migración 036: MSI por fechas y editar movimientos. */
export function tieneEsquemaMsi(): Promise<boolean> {
  return sondear('msi', 'installments', 'month_status')
}

/** Migración 038: pagos de tarjeta (`transfer`) y correcciones del estado de cuenta. */
export function tieneEsquemaPagos(): Promise<boolean> {
  return sondear('pagos', 'transactions', 'transfer_id')
}

/** Sólo para pruebas. */
export function olvidarEsquema() {
  respuestas.clear()
}
