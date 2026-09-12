import { describe, expect, it } from 'vitest'
import html from '../../index.html?raw'
import vercel from '../../vercel.json'

/**
 * La red de arranque de `index.html` va en línea por obligación: si el bundle
 * da 404, nada que viva dentro del bundle llega a ejecutarse. Pero la política
 * dice `script-src 'self'`, que prohíbe exactamente eso.
 *
 * Hoy la cabecera es Report-Only, así que no rompe nada — sólo llena el informe
 * de violaciones. El día que se ponga en modo estricto, ese script moriría en
 * silencio, y es justo el que existe para que nada muera en silencio.
 *
 * La salida es el hash del script en la política. Y como un hash a mano se
 * queda viejo en cuanto alguien toque una línea, esta prueba lo recalcula.
 */
async function sha256Base64(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
}

function politica(): string {
  const headers = (vercel as { headers: { headers: { key: string; value: string }[] }[] }).headers
  for (const bloque of headers) {
    for (const h of bloque.headers) {
      if (h.key.toLowerCase().startsWith('content-security-policy')) return h.value
    }
  }
  throw new Error('No hay cabecera de CSP en vercel.json')
}

describe('CSP', () => {
  it('autoriza el script de arranque por su hash, y el hash está al día', async () => {
    const m = /<script>\n([\s\S]*?)\n {4}<\/script>/.exec(html)
    expect(m, 'no se encontró el script en línea de index.html').toBeTruthy()

    const esperado = `sha256-${await sha256Base64(m![1])}`
    expect(
      politica(),
      `El script de arranque cambió: pon '${esperado}' en script-src, en vercel.json.`,
    ).toContain(esperado)
  })

  it('sigue sin permitir scripts en línea arbitrarios', () => {
    // Un hash autoriza ese script y sólo ese. `unsafe-inline` en script-src
    // autorizaría cualquiera, incluido el que inyectara alguien, y en una app
    // con datos financieros eso no se negocia. En style-src sí está, y ahí es
    // inevitable: React escribe estilos en línea.
    const scriptSrc = /script-src ([^;]+)/.exec(politica())?.[1] ?? ''
    expect(scriptSrc).not.toContain('unsafe-inline')
    expect(scriptSrc).not.toContain('unsafe-eval')
    expect(scriptSrc).toMatch(/^'self' 'sha256-/)
  })

  it('sólo deja hablar con Supabase', () => {
    expect(politica()).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co")
  })
})
