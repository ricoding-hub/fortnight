import { describe, expect, it, afterEach, vi } from 'vitest'
import { CODIGOS_CUBIERTOS, authErrorMessage } from '@/lib/authErrors'
import { LONGITUD_MINIMA, fuerzaPassword, validarPassword } from '@/lib/password'

/** navigator.onLine no existe en Node; se finge sólo donde importa. */
function conConexion(online: boolean) {
  vi.stubGlobal('navigator', { onLine: online })
}
afterEach(() => vi.unstubAllGlobals())

describe('authErrorMessage', () => {
  it('traduce los códigos de Supabase al español', () => {
    conConexion(true)
    expect(authErrorMessage({ code: 'invalid_credentials' })).toBe('Correo o contraseña incorrectos.')
    expect(authErrorMessage({ code: 'email_not_confirmed' })).toMatch(/Confirma tu correo/)
    expect(authErrorMessage({ code: 'same_password' })).toMatch(/igual a la anterior/)
  })

  it('no revela si el correo está registrado', () => {
    conConexion(true)
    // Esta es la regla de seguridad: nada de "ese correo no existe".
    const msg = authErrorMessage({ code: 'invalid_credentials' })
    expect(msg).toContain('Correo o contraseña')
    expect(msg).not.toMatch(/no existe|no encontrado|not found/i)
    expect(authErrorMessage({ code: 'user_not_found' })).not.toMatch(/no existe|not found/i)
  })

  it('nunca deja pasar el texto original de Supabase', () => {
    conConexion(true)
    const crudo = { code: 'unknown_thing', message: 'Invalid login credentials' }
    const msg = authErrorMessage(crudo)
    expect(msg).not.toContain('Invalid login credentials')
    expect(msg).not.toContain('unknown_thing')
  })

  it('la falta de conexión gana a cualquier código', () => {
    conConexion(false)
    expect(authErrorMessage({ code: 'invalid_credentials' })).toMatch(/Sin conexión/)
  })

  it('reconoce el timeout de 20 s del cliente', () => {
    conConexion(true)
    const t = new Error('signal timed out')
    t.name = 'TimeoutError'
    expect(authErrorMessage(t)).toMatch(/tardó demasiado/)
  })

  it('entiende el status HTTP cuando no hay código', () => {
    conConexion(true)
    expect(authErrorMessage({ status: 429 })).toMatch(/Demasiados intentos/)
    expect(authErrorMessage({ status: 503 })).toMatch(/problema/)
  })

  it('cae a un mensaje genérico ante cualquier cosa', () => {
    conConexion(true)
    for (const raro of [null, undefined, 'texto suelto', 42, {}, []]) {
      expect(authErrorMessage(raro)).toBe('No pudimos completar la acción. Inténtalo de nuevo.')
    }
  })

  it('cubre los códigos que Supabase devuelve de verdad', () => {
    for (const c of ['invalid_credentials', 'email_not_confirmed', 'weak_password', 'over_email_send_rate_limit']) {
      expect(CODIGOS_CUBIERTOS).toContain(c)
    }
  })
})

describe('validarPassword', () => {
  it('exige la longitud mínima', () => {
    expect(validarPassword('corta123').ok).toBe(false)
    expect(validarPassword('a'.repeat(LONGITUD_MINIMA - 1)).ok).toBe(false)
    expect(validarPassword('catorcena2026').ok).toBe(true)
  })

  it('no deja colar espacios para llegar al mínimo', () => {
    expect(validarPassword('ab        ').ok).toBe(false)
  })

  it('rechaza las contraseñas de las listas más usadas', () => {
    expect(validarPassword('password123').ok).toBe(false)
    expect(validarPassword('miqwertyuiop').ok).toBe(false)
    // Incluido el nombre de la propia app, que es lo primero que se prueba.
    expect(validarPassword('fortnight2026').ok).toBe(false)
  })

  it('rechaza repeticiones y secuencias', () => {
    expect(validarPassword('aaaaaaaaaaaa').ok).toBe(false)
    expect(validarPassword('abcdefghijkl').ok).toBe(false)
    expect(validarPassword('9876543210').ok).toBe(false)
  })

  it('acepta una frase larga sin exigir símbolos raros', () => {
    // La longitud aporta más que la ofuscación, y esto hay que poder usarlo.
    expect(validarPassword('mi perro se llama Tomate').ok).toBe(true)
  })

  it('da un mensaje accionable, no un reglamento', () => {
    const r = validarPassword('corta')
    expect(r.error).toContain(String(LONGITUD_MINIMA))
  })
})

describe('fuerzaPassword', () => {
  it('marca débil lo que no llega al mínimo', () => {
    expect(fuerzaPassword('corta')).toBe('débil')
  })

  it('sube con la longitud y la variedad', () => {
    expect(fuerzaPassword('catorcena1')).toBe('aceptable')
    expect(fuerzaPassword('Catorcena2026')).toBe('buena')      // 13, sin símbolos
    expect(fuerzaPassword('Catorcena-2026-Larga!')).toBe('fuerte')
  })

  it('premia la longitud aunque no haya símbolos', () => {
    expect(fuerzaPassword('mi perro se llama tomate')).not.toBe('débil')
  })
})
