#!/usr/bin/env node
/**
 * Pagar la tarjeta en un navegador de verdad (mismo arnés que msi.mjs).
 *
 * Comprueba, a 320, 360 y 390 px, que el aviso de Inicio dice lo que falta del
 * estado de cuenta (no el saldo completo), y que el modal de pago y el estado de
 * cuenta caben en la pantalla con el botón a la vista.
 *
 * Uso:  node e2e/pagos.mjs
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const PUERTO = 5199
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
const dia = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Corte hace 10 días y pago en 2: el aviso de Inicio tiene que salir.
const corte = Number(dia(-10).slice(8))
const pago = Number(dia(2).slice(8))
const TABLAS = {
  accounts: [
    cuenta({ id: 'a-1', name: 'BBVA débito', type: 'debit', balance: 7430.1, sort_order: 0 }),
    cuenta({ id: 'a-2', name: 'MercadoPago', type: 'credit', balance: 8110.75, credit_limit: 20000, cut_day: corte, payment_due_day: pago, sort_order: 1, created_at: '2026-01-01T00:00:00Z' }),
  ],
  transactions: [
    { id: 't-1', user_id: 'u-1', account_id: 'a-2', amount: 1200, category_id: 'c-3', description: 'Súper', date: dia(-3), type: 'transaction', transfer_id: null, installment_id: null, created_at: '2026-01-01T00:00:00Z' },
  ],
  installments: [],
  card_statements: [],
  categories: ['Renta:fixed', 'Servicios:fixed', 'Suscripciones:fixed', 'Comida:variable', 'Social:variable', 'Transporte:variable', 'Salud:variable', 'Otros:variable', 'Salario:income', 'Vales:income'].map((x, i) => {
    const [name, kind] = x.split(':')
    return { id: `c-${i}`, user_id: 'u-1', name, kind, icon: null, color: null, created_at: '' }
  }),
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
const medir = () => {
  const d = document.querySelector('[role="dialog"]')
  const r = d?.getBoundingClientRect()
  return {
    vh: innerHeight,
    dialogo: r ? { top: r.top, bottom: r.bottom } : null,
    desborda: document.documentElement.scrollWidth > innerWidth || (d ? d.scrollWidth > d.clientWidth : false),
  }
}
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
    const aviso = page.getByRole('region', { name: 'Pago próximo' })
    await aviso.waitFor({ timeout: 30_000 })
    await page.waitForTimeout(600)
    const texto = await aviso.innerText()
    // Saldo 8,110.75 menos la compra de después del corte: 6,910.75.
    comprobar(texto.includes('6,910.75') && !texto.includes('8,110.75'), `el aviso dice lo del estado, no el saldo («${texto.replace(/\s+/g, ' ').slice(0, 80)}»)`)
    await page.screenshot({ path: `${SHOTS}/pago-inicio-${t.w}x${t.h}.png` })

    await aviso.getByRole('button', { name: /Pagar/ }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.waitForTimeout(700)
    let m = await page.evaluate(medir)
    comprobar(m.dialogo && m.dialogo.bottom <= m.vh + 0.5 && m.dialogo.top >= -0.5, `pagar cabe (${Math.round(m.dialogo?.top)}–${Math.round(m.dialogo?.bottom)} de ${m.vh})`)
    comprobar(!m.desborda, 'pagar sin desbordamiento horizontal')
    const boton = page.getByRole('button', { name: /^Pagar \$/ })
    const caja = await boton.boundingBox()
    comprobar(caja && caja.y + caja.height <= m.vh + 0.5, 'el botón de pagar se ve')
    comprobar((await boton.innerText()).includes('6,910.75'), 'sale elegido lo que falta')
    await page.screenshot({ path: `${SHOTS}/pago-modal-${t.w}x${t.h}.png` })

    await page.getByRole('button', { name: 'Ver estado de cuenta' }).click()
    await page.waitForTimeout(700)
    m = await page.evaluate(medir)
    comprobar(m.dialogo && m.dialogo.bottom <= m.vh + 0.5 && m.dialogo.top >= -0.5, `el estado de cuenta cabe (${Math.round(m.dialogo?.top)}–${Math.round(m.dialogo?.bottom)} de ${m.vh})`)
    comprobar(!m.desborda, 'el estado de cuenta sin desbordamiento horizontal')
    await page.screenshot({ path: `${SHOTS}/pago-estado-${t.w}x${t.h}.png` })
    comprobar(errores.length === 0, `sin errores de página${errores.length ? ': ' + errores[0] : ''}`)
    await ctx.close()
  }
} finally {
  await browser.close()
  servidor.kill()
}
console.log(fallos === 0 ? '\n✓ Pagar y el estado de cuenta se ven completos en todos los tamaños.' : `\n✗ ${fallos} comprobación(es) fallaron.`)
process.exit(fallos === 0 ? 0 : 1)
