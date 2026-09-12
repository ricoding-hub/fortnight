/**
 * Mensajes de autenticación en español, y sin filtrar de más.
 *
 * `errorMessage()` sirve para errores de datos, pero en autenticación hace dos
 * cosas malas: antepone el código — una contraseña mal escrita sale como
 * `invalid_credentials: Invalid login credentials` — y deja pasar el texto de
 * Supabase en inglés tal cual.
 *
 * Hay además una regla de seguridad que un mapeo genérico se salta: **nunca
 * decir si un correo está registrado**. Por eso `invalid_credentials` habla de
 * "correo o contraseña" sin precisar cuál falló, y por eso la recuperación
 * responde siempre lo mismo, exista la cuenta o no. Confirmar qué correos hay
 * en la base es regalar la mitad del trabajo a quien pruebe credenciales.
 */

/** Códigos que Supabase devuelve en `AuthError.code`. */
const MENSAJES: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_not_confirmed: 'Confirma tu correo antes de entrar. Revisa tu bandeja.',
  user_already_exists: 'Ya existe una cuenta con ese correo. Intenta entrar.',
  email_exists: 'Ya existe una cuenta con ese correo. Intenta entrar.',
  weak_password: 'Esa contraseña es muy fácil de adivinar. Usa uno más largo.',
  same_password: 'La contraseña nueva es igual a la anterior.',
  over_email_send_rate_limit: 'Enviamos demasiados correos. Espera un minuto e inténtalo otra vez.',
  over_request_rate_limit: 'Demasiados intentos. Espera un minuto e inténtalo otra vez.',
  otp_expired: 'Ese enlace ya venció. Pide uno nuevo.',
  validation_failed: 'Revisa los datos e inténtalo otra vez.',
  user_not_found: 'No pudimos completar la acción.',
  session_not_found: 'Tu sesión venció. Vuelve a entrar.',
  signup_disabled: 'El registro está deshabilitado por ahora.',
  email_address_invalid: 'Ese correo no parece válido.',
}

/** Lo que se dice cuando no reconocemos el código: nada del error original. */
const GENERICO = 'No pudimos completar la acción. Inténtalo de nuevo.'

function codigoDe(e: unknown): string | null {
  if (e == null || typeof e !== 'object') return null
  const o = e as Record<string, unknown>
  if (typeof o.code === 'string' && o.code) return o.code
  // Los AuthError viejos traen `error_code`; los HTTP traen `status`.
  if (typeof o.error_code === 'string' && o.error_code) return o.error_code
  return null
}

/**
 * Traduce cualquier error de autenticación a algo que se le pueda enseñar a una
 * persona. Sin red, lo dice: es la causa más común y la más fácil de resolver.
 */
export function authErrorMessage(e: unknown): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Sin conexión. Conéctate a internet e inténtalo de nuevo.'
  }

  const codigo = codigoDe(e)
  if (codigo && MENSAJES[codigo]) return MENSAJES[codigo]

  // El timeout de 20 s de src/lib/supabase.ts llega como DOMException.
  if (e instanceof Error && e.name === 'TimeoutError') {
    return 'El servidor tardó demasiado. Inténtalo de nuevo.'
  }

  // Algunos errores llegan sin código pero con un status HTTP reconocible.
  const status = e != null && typeof e === 'object' ? (e as { status?: unknown }).status : null
  if (status === 429) return MENSAJES.over_request_rate_limit
  if (typeof status === 'number' && status >= 500) {
    return 'El servidor tuvo un problema. Inténtalo en un momento.'
  }

  return GENERICO
}

/** Para pruebas y para saber qué códigos están cubiertos. */
export const CODIGOS_CUBIERTOS = Object.keys(MENSAJES)
