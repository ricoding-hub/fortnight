/**
 * Preferencias del formulario «Agregar»: última categoría, cuenta y tipo.
 *
 * Registrar un gasto tiene que tomar segundos, y casi siempre es en la misma
 * cuenta y de la misma categoría que la vez anterior. Recordarlo quita dos
 * toques de cada movimiento.
 *
 * Es sólo una comodidad por navegador: se lee y se escribe con try/catch porque
 * `localStorage` puede lanzar (modo privado, datos bloqueados) y el formulario
 * tiene que funcionar igual sin él. Nada financiero se guarda aquí — ids de
 * categoría y de cuenta, no importes.
 */

const PREFIJO = 'fortnight:add:'

export function leerPref(clave: string): string | null {
  try {
    return window.localStorage.getItem(PREFIJO + clave)
  } catch {
    return null
  }
}

export function guardarPref(clave: string, valor: string): void {
  try {
    window.localStorage.setItem(PREFIJO + clave, valor)
  } catch {
    // Sin almacenamiento no hay recuerdo, y no pasa nada.
  }
}

/** Devuelve la preferencia sólo si sigue siendo una opción válida (puede haberse borrado). */
export function prefValida(clave: string, validas: readonly string[]): string | null {
  const v = leerPref(clave)
  return v && validas.includes(v) ? v : null
}
