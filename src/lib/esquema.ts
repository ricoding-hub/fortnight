import { supabase } from '@/lib/supabase'

/**
 * ¿Ya se corrió la migración 036 (MSI por fechas + editar movimientos)?
 *
 * Sin ella la app funciona igual al leer; sólo algunas escrituras usan el
 * camino viejo (borrar e insertar en vez de editar). Se pregunta una vez por
 * sesión. Un error que no sea «columna inexistente» no se recuerda: se vuelve a
 * preguntar la próxima vez, y mientras tanto se usa el camino viejo, que
 * también es correcto.
 */
let respuesta: Promise<boolean> | null = null

export function tieneEsquemaMsi(): Promise<boolean> {
  if (respuesta) return respuesta
  const intento = (async () => {
    const { error } = await supabase.from('installments').select('month_status').limit(0)
    if (!error) return true
    if (error.code === '42703' || error.code === 'PGRST204') return false
    respuesta = null
    return false
  })()
  respuesta = intento
  return intento
}

/** Sólo para pruebas. */
export function olvidarEsquema() {
  respuesta = null
}
