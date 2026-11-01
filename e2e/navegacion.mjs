#!/usr/bin/env node
/**
 * Navegación de v1.19 en un navegador de verdad (arnés de msi.mjs).
 *
 * Comprueba, a 320, 360 y 390 px:
 *   · la barra de abajo trae Inicio, Cuentas, Préstamos y Plan (sin Perfil);
 *   · Préstamos se abre desde la barra con su propio título;
 *   · tocar tu foto en Inicio abre Perfil;
 *   · los enlaces viejos /cuentas/prestamos llevan a /prestamos;
 *   · Cuentas tiene la pestaña MSI;
 *   · en modo ligero el aviso de pago dice sólo la fecha, sin monto calculado;
 *   · Inicio no se desborda a lo ancho.
 *
 * No necesita Supabase: la red se simula (`fake.supabase.co`).
 *
 * Uso:  node e2e/navegacion.mjs
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const PUERTO = 5201
const BASE = `http://127.0.0.1:${PUERTO}`
const SB = 'https://fake.supabase.co'
const SHOTS = 'e2e/capturas'
mkdirSync(SHOTS, { recursive: true })

/* ── Datos simulados ──────────────────────────────────────────────────────── */

const ahora = Math.floor(Date.now() / 1000)
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-1', role: 'authenticated', exp: ahora + 3600 })}.firma`
const usuario = {
  id: 'u-1', aud: 'authenticated', role: 'authenticated', email: 'prueba@fortnight.test',
  app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
}
const sesion = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: ahora + 3600, user: usuario }

const cuenta = (o) => ({
  user_id: 'u-1', credit_limit: null, cut_day: null, payment_due_day: null, payment_grace_days: null,
  color: null, logo_domain: null, cost_type: null, apr: null, min_payment_pct: null, prepay_buffer: 0,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', source: 'manual', ...o,
})
// Fechas relativas a hoy: el aviso de pago debe salir «en 2 días».
const hoy = new Date()
const enDias = (n) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n)
const vence = enDias(2)
const corte = enDias(-18)
const TABLAS = {
  accounts: [
    cuenta({ id: 'a-1', name: 'BBVA débito', type: 'debit', balance: 860, sort_order: 0 }),
    // Modo ligero (sin track_statement): el aviso dice sólo la fecha.
    cuenta({ id: 'a-2', name: 'Nu', type: 'credit', balance: 23329, credit_limit: 40000, cut_day: corte.getDate(), payment_due_day: vence.getDate(), sort_order: 1 }),
  ],
  categories: ['Renta:fixed', 'Servicios:fixed', 'Suscripciones:fixed', 'Comida:variable', 'Social:variable', 'Transporte:variable', 'Salud:variable', 'Otros:variable', 'Salario:income', 'Vales:income'].map((x, i) => {
    const [name, kind] = x.split(':')
    return { id: `c-${i}`, user_id: 'u-1', name, kind, icon: null, color: null, created_at: '' }
  }),
  user_config: [{ user_id: 'u-1', pay_amount: 9000, pay_freq: 'quincenal', next_pay_date: enDias(5).toISOString().slice(0, 10), updated_at: '2026-10-01T00:00:00Z' }],
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}

async function simularSupabase(context) {
  await context.route(`${SB}/**`, async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const url = new URL(req.url())
    const json = (status, cuerpo) =>
      route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })

    if (url.pathname.startsWith('/auth/v1/user')) return json(200, usuario)
    if (url.pathname.startsWith('/auth/v1/token')) return json(200, sesion)
    if (url.pathname.startsWith('/auth/v1/')) return json(200, {})

    if (url.pathname.startsWith('/rest/v1/')) {
      const tabla = url.pathname.split('/')[3]
      const filas = TABLAS[tabla] ?? []
      // `.single()` / `.maybeSingle()` piden un objeto, no un arreglo.
      if ((req.headers()['accept'] ?? '').includes('pgrst.object')) {
        return filas[0] ? json(200, filas[0]) : json(406, { code: 'PGRST116', message: 'sin filas', details: '', hint: '' })
      }
      return json(200, filas)
    }
    return json(200, {})
  })
  // La tipografía de Google no se alcanza desde aquí y la petición se queda colgada.
  await context.route('https://fonts.googleapis.com/**', (r) => r.abort())
  await context.route('https://fonts.gstatic.com/**', (r) => r.abort())
}

/* ── Servidor de desarrollo ───────────────────────────────────────────────── */

function arrancarVite() {
  const proc = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(PUERTO), '--host', '127.0.0.1', '--strictPort'], {
    env: { ...process.env, VITE_SUPABASE_URL: SB, VITE_SUPABASE_KEY: 'clave-falsa' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return new Promise((ok, fallo) => {
    const t = setTimeout(() => fallo(new Error('Vite no arrancó en 60 s')), 60_000)
    const ver = (d) => {
      if (String(d).includes('Local:')) { clearTimeout(t); ok(proc) }
    }
    proc.stdout.on('data', ver)
    proc.stderr.on('data', (d) => { if (/error/i.test(String(d))) console.error(String(d)) })
    proc.on('exit', (c) => fallo(new Error(`Vite salió con ${c}`)))
  })
}


let fallos = 0
const comprobar = (ok, m) => { if (!ok) fallos++; console.log(`    ${ok ? 'OK   ' : 'FALLA'} ${m}`) }
const ruta = (page) => new URL(page.url()).pathname

const servidor = await arrancarVite()
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
try {
  for (const t of [{ w: 320, h: 568 }, { w: 360, h: 640 }, { w: 390, h: 844 }]) {
    console.log(`\n${t.w}×${t.h}`)
    const ctx = await browser.newContext({ viewport: { width: t.w, height: t.h }, deviceScaleFactor: 2, hasTouch: true })
    await ctx.addInitScript(([k, v]) => {
      localStorage.setItem(k, v)
      localStorage.setItem('fortnight_tour_seen', '1')
    }, ['sb-fake-auth-token', JSON.stringify(sesion)])
    await simularSupabase(ctx)
    const page = await ctx.newPage()
    const errores = []
    page.on('pageerror', (e) => errores.push(e.message))

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('button[aria-label="Tu perfil"]', { timeout: 30_000 })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${SHOTS}/inicio-${t.w}x${t.h}.png` })

    const barra = page.getByRole('navigation', { name: 'Navegación principal' })
    const etiquetas = (await barra.innerText()).replace(/\s+/g, ' ')
    comprobar(['Inicio', 'Cuentas', 'Préstamos', 'Plan'].every((x) => etiquetas.includes(x)), `la barra trae Inicio, Cuentas, Préstamos y Plan («${etiquetas.trim()}»)`)
    comprobar(!etiquetas.includes('Perfil'), 'Perfil ya no está en la barra')

    const texto = await page.evaluate(() => document.body.innerText)
    comprobar(/Nu vence en 2 días/.test(texto), 'el aviso ligero dice «Nu vence en 2 días»')
    comprobar(!/para no generar intereses/.test(texto), 'sin monto calculado «para no generar intereses»')
    comprobar(!/días de racha/.test(texto), 'sin tarjeta de racha')
    comprobar(!/Conecta tu banco/.test(texto), 'sin «Conecta tu banco»')
    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    comprobar(!desborda, 'Inicio sin desbordamiento horizontal')

    // «Pagar» en modo ligero: fecha límite, sin «te falta», «Otro monto» elegido.
    await page.getByRole('button', { name: 'Pagar', exact: true }).first().click()
    const hoja = page.getByRole('dialog')
    await hoja.waitFor({ timeout: 10_000 })
    await page.waitForTimeout(500)
    const enHoja = await hoja.innerText()
    comprobar(/Fecha límite/.test(enHoja), 'la hoja de pago dice la fecha límite')
    comprobar(!/Te falta/.test(enHoja), 'la hoja de pago no calcula «te falta»')
    const elegida = await hoja.getByRole('radio', { checked: true }).innerText()
    comprobar(/Otro monto/.test(elegida), `«Otro monto» viene elegido («${elegida.trim()}»)`)
    const caja = await hoja.boundingBox()
    comprobar(!!caja && caja.y >= -0.5 && caja.y + caja.height <= t.h + 0.5, 'la hoja de pago cabe en la pantalla')
    await page.screenshot({ path: `${SHOTS}/pagar-ligero-${t.w}x${t.h}.png` })
    await page.keyboard.press('Escape')
    await hoja.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {})

    await barra.getByRole('link', { name: /Préstamos/ }).click()
    await page.waitForSelector('h1:has-text("Préstamos")', { timeout: 10_000 })
    comprobar(ruta(page) === '/prestamos', `Préstamos desde la barra (${ruta(page)})`)
    await page.screenshot({ path: `${SHOTS}/prestamos-${t.w}x${t.h}.png` })

    await barra.getByRole('link', { name: /Inicio/ }).click()
    await page.getByRole('button', { name: 'Tu perfil' }).click()
    await page.waitForURL((u) => u.pathname === '/perfil', { timeout: 10_000 }).catch(() => {})
    comprobar(ruta(page) === '/perfil', 'la foto abre Perfil')

    await page.goto(`${BASE}/cuentas/prestamos`, { waitUntil: 'domcontentloaded' })
    // «**/prestamos» también casa con /cuentas/prestamos: se compara la ruta exacta.
    await page.waitForURL((u) => u.pathname === '/prestamos', { timeout: 15_000 }).catch(() => {})
    comprobar(ruta(page) === '/prestamos', `/cuentas/prestamos redirige (${ruta(page)})`)

    await page.goto(`${BASE}/cuentas`, { waitUntil: 'domcontentloaded' })
    const msi = page.getByRole('link', { name: 'MSI', exact: true })
    await msi.waitFor({ timeout: 15_000 })
    await msi.click()
    await page.waitForURL((u) => u.pathname === '/cuentas/msi', { timeout: 10_000 }).catch(() => {})
    comprobar(ruta(page) === '/cuentas/msi', 'la pestaña MSI de Cuentas')

    comprobar(errores.length === 0, `sin errores de página${errores.length ? ': ' + errores[0] : ''}`)
    await ctx.close()
  }
} finally {
  await browser.close()
  servidor.kill()
}
console.log(fallos === 0 ? '\n✓ La navegación funciona en todos los tamaños.' : `\n✗ ${fallos} comprobación(es) fallaron.`)
process.exit(fallos === 0 ? 0 : 1)
