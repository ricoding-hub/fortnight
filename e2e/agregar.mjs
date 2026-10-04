#!/usr/bin/env node
/**
 * La hoja «Agregar», medida en un navegador de verdad y con pantallas chicas.
 *
 * El reporte era "se corta bien feo la interfaz": un numpad de ~40 % de la
 * pantalla dejaba la rejilla de categorías a media fila. jsdom no mide píxeles,
 * así que esto levanta la app en Chromium y comprueba, en cada tipo y a varios
 * tamaños — incluido uno de 440 px de alto, que es lo que queda con el teclado
 * abierto —, que:
 *
 *   · el botón de guardar queda dentro de la pantalla,
 *   · el diálogo cabe en la pantalla,
 *   · no hay desbordamiento horizontal,
 *   · y si el contenido es más alto que el espacio, el cuerpo se desplaza y se
 *     puede llegar al último campo.
 *
 * No necesita Supabase: la red se simula (`fake.supabase.co`), así que corre en
 * contenedores sin salida a internet.
 *
 * Uso:  node e2e/agregar.mjs
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
const TABLAS = {
  accounts: [
    cuenta({ id: 'a-1', name: 'BBVA débito', type: 'debit', balance: 7430.1, sort_order: 0 }),
    cuenta({ id: 'a-2', name: 'Nu', type: 'credit', balance: 4000, credit_limit: 20000, cut_day: 12, payment_due_day: 2, sort_order: 1 }),
  ],
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
  const proc = spawn('npx', ['vite', '--port', String(PUERTO), '--host', '127.0.0.1', '--strictPort'], {
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

/* ── Medición ─────────────────────────────────────────────────────────────── */

const TAMANOS = [
  { w: 320, h: 568, nota: 'iPhone SE, el más chico' },
  { w: 360, h: 640, nota: 'Android común' },
  { w: 390, h: 844, nota: 'iPhone 14' },
  { w: 390, h: 440, nota: 'con el teclado abierto' },
]
const TIPOS = ['Gasto', 'Ingreso', 'Préstamo', 'A meses']

const medir = () => {
  const d = document.querySelector('[role="dialog"]')
  const r = d.getBoundingClientRect()
  const boton = document.querySelector('button[type="submit"][form="add-form"]')
  const b = boton?.getBoundingClientRect()
  const cuerpo = d.querySelector('.overflow-y-auto')
  return {
    vw: innerWidth, vh: innerHeight,
    dialogo: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
    boton: b ? { top: b.top, bottom: b.bottom, left: b.left, right: b.right, alto: b.height } : null,
    cuerpo: cuerpo ? { total: cuerpo.scrollHeight, visible: cuerpo.clientHeight } : null,
    desborda: document.documentElement.scrollWidth > innerWidth || d.scrollWidth > d.clientWidth,
    // Texto cortado con «…»: un botón cuyo contenido es más ancho que él mismo.
    truncadas: [...d.querySelectorAll('[role="radio"]')]
      .filter((b) => b.scrollWidth > b.clientWidth + 1)
      .map((b) => b.textContent),
  }
}

let fallos = 0
const comprobar = (ok, mensaje) => {
  if (!ok) fallos++
  console.log(`    ${ok ? 'OK   ' : 'FALLA'} ${mensaje}`)
}

const servidor = await arrancarVite()
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
try {
  for (const t of TAMANOS) {
    console.log(`\n${t.w}×${t.h} — ${t.nota}`)
    const ctx = await browser.newContext({ viewport: { width: t.w, height: t.h }, deviceScaleFactor: 2, hasTouch: true })
    await ctx.addInitScript(([k, v]) => {
      localStorage.setItem(k, v)
      // El tour guiado de primera vez tapa la pantalla y se come los clics.
      localStorage.setItem('fortnight_tour_seen', '1')
    }, ['sb-fake-auth-token', JSON.stringify(sesion)])
    await simularSupabase(ctx)
    const page = await ctx.newPage()
    const errores = []
    page.on('pageerror', (e) => errores.push(e.message))

    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('nav[aria-label="Navegación principal"]', { timeout: 30_000 })
    await page.getByRole('button', { name: 'Agregar movimiento' }).click()
    await page.waitForSelector('[role="dialog"]')
    await page.waitForTimeout(700) // la animación de entrada

    for (const tipo of TIPOS) {
      await page.getByRole('radio', { name: tipo, exact: true }).click()
      await page.waitForTimeout(350)
      if (tipo === 'A meses') {
        // El caso más largo: con «Más opciones» abierto.
        await page.getByRole('button', { name: /Más opciones/ }).click()
        await page.waitForTimeout(250)
      }
      const m = await page.evaluate(medir)
      console.log(`  · ${tipo}`)
      comprobar(m.dialogo.bottom <= m.vh + 0.5 && m.dialogo.top >= -0.5, `el diálogo cabe (${Math.round(m.dialogo.top)}–${Math.round(m.dialogo.bottom)} de ${m.vh})`)
      comprobar(!!m.boton && m.boton.top >= 0 && m.boton.bottom <= m.vh + 0.5, `el botón de guardar está a la vista${m.boton ? ` (${Math.round(m.boton.top)}–${Math.round(m.boton.bottom)})` : ' — NO EXISTE'}`)
      comprobar(!!m.boton && m.boton.alto >= 44, `el botón mide ≥ 44 px (${m.boton ? Math.round(m.boton.alto) : '—'})`)
      comprobar(!m.desborda, 'sin desbordamiento horizontal')
      comprobar(m.truncadas.length === 0, `las opciones no se cortan con «…»${m.truncadas.length ? ': ' + m.truncadas.join(', ') : ''}`)
      if (m.cuerpo && m.cuerpo.total > m.cuerpo.visible + 1) {
        const llega = await page.evaluate(() => {
          const c = document.querySelector('[role="dialog"] .overflow-y-auto')
          c.scrollTop = c.scrollHeight
          return c.scrollTop > 0
        })
        comprobar(llega, `el cuerpo se desplaza (${m.cuerpo.total} de ${m.cuerpo.visible} px visibles)`)
        // Tras bajar del todo, el botón sigue en su sitio (es el pie fijo).
        const despues = await page.evaluate(medir)
        comprobar(despues.boton.bottom <= despues.vh + 0.5, 'el botón no se movió al desplazar')
        await page.evaluate(() => { document.querySelector('[role="dialog"] .overflow-y-auto').scrollTop = 0 })
      }
      await page.screenshot({ path: `${SHOTS}/agregar-${tipo.replace(' ', '')}-${t.w}x${t.h}.png` })
    }
    comprobar(errores.length === 0, `sin errores de página${errores.length ? ': ' + errores[0] : ''}`)
    await ctx.close()
  }
} finally {
  await browser.close()
  servidor.kill()
}

console.log(fallos === 0 ? '\n✓ La hoja «Agregar» cabe y se puede usar en todos los tamaños.' : `\n✗ ${fallos} comprobación(es) fallaron.`)
process.exit(fallos === 0 ? 0 : 1)
