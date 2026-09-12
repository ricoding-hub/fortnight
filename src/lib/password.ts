/**
 * Política de contraseñas.
 *
 * Mínimo 10 caracteres. El mínimo que Supabase trae de fábrica son 6, que para
 * una app con saldos y deudas se queda corto, y el cliente valida antes de que
 * el servidor tenga que decir que no.
 *
 * Deliberadamente no se exigen símbolos ni mayúsculas: la longitud aporta mucha
 * más entropía que la ofuscación, y las reglas barrocas empujan a la gente a
 * reutilizar la misma contraseña de siempre con un "!" al final. Lo que sí se
 * rechaza es lo que de verdad se adivina — secuencias, repeticiones y las
 * contraseñas de las listas más usadas.
 */

export const LONGITUD_MINIMA = 10

/** Lo primero que prueba cualquiera. Comparación en minúsculas. */
const COMUNES = [
  'password', 'contrasena', 'contraseña', '1234567890', 'qwertyuiop',
  'iloveyou', 'princess', 'admin1234', 'welcome123', 'abc123456',
  'password1', 'fortnight', 'qwerty123', '123456789', 'letmein123',
]

export interface ResultadoPassword {
  ok: boolean
  /** Mensaje para el usuario cuando `ok` es false. */
  error?: string
}

export function validarPassword(valor: string): ResultadoPassword {
  if (valor.length < LONGITUD_MINIMA) {
    return { ok: false, error: `Usa al menos ${LONGITUD_MINIMA} caracteres.` }
  }
  // Una contraseña de puros espacios pasa la longitud y no protege nada.
  if (valor.trim().length < LONGITUD_MINIMA) {
    return { ok: false, error: `Usa al menos ${LONGITUD_MINIMA} caracteres que no sean espacios.` }
  }
  const bajo = valor.toLowerCase()
  if (COMUNES.some((c) => bajo.includes(c))) {
    return { ok: false, error: 'Esa contraseña es de las más usadas. Elige otra.' }
  }
  if (/^(.)\1+$/.test(valor)) {
    return { ok: false, error: 'No repitas el mismo carácter.' }
  }
  if (esSecuencia(bajo)) {
    return { ok: false, error: 'Evita secuencias como 12345 o abcde.' }
  }
  return { ok: true }
}

/** Todos los caracteres suben o bajan de uno en uno: "123456", "abcdef". */
function esSecuencia(v: string): boolean {
  if (v.length < 4) return false
  let sube = true
  let baja = true
  for (let i = 1; i < v.length; i++) {
    const paso = v.charCodeAt(i) - v.charCodeAt(i - 1)
    if (paso !== 1) sube = false
    if (paso !== -1) baja = false
  }
  return sube || baja
}

export type Fuerza = 'débil' | 'aceptable' | 'buena' | 'fuerte'

/**
 * Fuerza aproximada para el medidor de la interfaz. No es una medida de
 * entropía real: es una señal para empujar hacia contraseñas más largas.
 */
export function fuerzaPassword(valor: string): Fuerza {
  if (valor.length < LONGITUD_MINIMA) return 'débil'
  let puntos = 0
  if (valor.length >= 12) puntos++
  if (valor.length >= 16) puntos++
  if (/[a-z]/.test(valor) && /[A-Z]/.test(valor)) puntos++
  if (/\d/.test(valor)) puntos++
  if (/[^\w\s]/.test(valor)) puntos++
  if (puntos >= 4) return 'fuerte'
  if (puntos >= 3) return 'buena'
  if (puntos >= 1) return 'aceptable'
  return 'débil'
}
