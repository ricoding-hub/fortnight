/**
 * Adónde llevar a alguien que abrió un enlace (invitación a un grupo o a la
 * app) antes de tener sesión.
 *
 * Antes sólo `AuthCallback` lo leía, y ese camino es el de enlace mágico y
 * Google. Quien entraba con correo y contraseña caía en Inicio y la invitación
 * se perdía sin aviso. Ahora lo leen los dos caminos.
 */

const CLAVE_GRUPO = 'fortnight_pending_join'
const CLAVE_APP = 'fortnight_pending_invite'
/** Un enlace que se abrió hace más de un día ya no es la intención de ahora. */
const VIGENCIA_MS = 24 * 60 * 60 * 1000

function leer(clave: string, ahora: number): string | null {
  try {
    const crudo = localStorage.getItem(clave)
    if (!crudo) return null
    // Formato viejo: el código tal cual.
    if (!crudo.startsWith('{')) return crudo
    const v = JSON.parse(crudo) as { code?: unknown; at?: unknown }
    if (typeof v.code !== 'string' || !v.code) return null
    if (typeof v.at === 'number' && ahora - v.at > VIGENCIA_MS) {
      localStorage.removeItem(clave)
      return null
    }
    return v.code
  } catch {
    return null
  }
}

function guardar(clave: string, code: string, ahora: number) {
  try {
    localStorage.setItem(clave, JSON.stringify({ code, at: ahora }))
  } catch {
    // Sin almacenamiento (modo privado): el usuario tendrá que volver a abrir el enlace.
  }
}

export function guardarGrupoPendiente(code: string, ahora = Date.now()) {
  guardar(CLAVE_GRUPO, code, ahora)
}

export function guardarInvitacionPendiente(token: string, ahora = Date.now()) {
  guardar(CLAVE_APP, token, ahora)
}

export function olvidarGrupoPendiente() {
  try {
    localStorage.removeItem(CLAVE_GRUPO)
  } catch {
    // nada que limpiar
  }
}

export function olvidarInvitacionPendiente() {
  try {
    localStorage.removeItem(CLAVE_APP)
  } catch {
    // nada que limpiar
  }
}

/**
 * La ruta pendiente, o `null`. No la borra: la borra la pantalla de destino
 * cuando de verdad la procesa, así un fallo de red no la pierde.
 */
export function destinoPendiente(ahora = Date.now()): string | null {
  const grupo = leer(CLAVE_GRUPO, ahora)
  if (grupo) return `/join/${encodeURIComponent(grupo)}`
  const app = leer(CLAVE_APP, ahora)
  if (app) return `/invite/${encodeURIComponent(app)}`
  return null
}
