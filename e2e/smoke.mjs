#!/usr/bin/env node
/**
 * Recorrido de humo con una sesión real.
 *
 * Esto es lo que faltaba cuando se publicó v1.7.5: `tsc`, los tests y el build
 * pasaron, y aun así la pantalla de Inicio reventaba al dibujarse con datos de
 * verdad. Ninguna de las tres cosas ejecuta un componente contra Supabase.
 *
 * Falla si aparece cualquier error de consola, cualquier rechazo no capturado,
 * o el ErrorBoundary — esa última comprobación es la que habría atrapado la
 * caída antes de que llegara al usuario.
 *
 * Uso:
 *   npm i -D playwright            # a demanda: su postinstall baja navegadores
 *   npx vite --port 5173 &
 *   E2E_EMAIL=... E2E_PASSWORD=... node e2e/smoke.mjs
 *
 * Las credenciales van por variable de entorno, nunca en el repositorio.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173'
const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD
const SHOTS = 'e2e/capturas'

if (!EMAIL || !PASSWORD) {
  console.error('Faltan E2E_EMAIL y E2E_PASSWORD.')
  process.exit(1)
}

/** Las cinco vistas y sus subpestañas, en el orden en que las usa alguien. */
const RUTAS = [
  ['/', 'resumen'],
  ['/cuentas/mis', 'cuentas'],
  ['/cuentas/movimientos', 'movimientos'],
  ['/cuentas/prestamos', 'prestamos'],
  ['/plan/proyeccion', 'proyeccion'],
  ['/plan/presupuesto', 'presupuesto'],
  ['/plan/objetivos', 'objetivos'],
  ['/perfil', 'perfil'],
  ['/acerca-de', 'acerca-de'],
]

mkdirSync(SHOTS, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 })

const problemas = []
page.on('console', (m) => {
  if (m.type() === 'error') problemas.push(`consola · ${m.text().slice(0, 200)}`)
})
page.on('pageerror', (e) => problemas.push(`excepción · ${e.message.slice(0, 200)}`))

/** El ErrorBoundary tiene un título fijo: si está, la vista se cayó. */
async function reventó() {
  return page.locator('h1', { hasText: 'Algo se rompió en esta pantalla' }).count().then((n) => n > 0)
}

console.log(`→ ${BASE}`)
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', EMAIL)
await page.fill('input[type="password"]', PASSWORD)
await page.click('button[type="submit"]')

// La sesión se resuelve cuando la barra inferior aparece.
await page.waitForSelector('nav[aria-label="Navegación principal"]', { timeout: 20_000 })
console.log('  sesión iniciada')

let fallos = 0
for (const [ruta, nombre] of RUTAS) {
  const antes = problemas.length
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200) // que los hooks terminen de traer datos
  const roto = await reventó()
  const nuevos = problemas.slice(antes)
  await page.screenshot({ path: `${SHOTS}/${nombre}.png` })

  const ok = !roto && nuevos.length === 0
  if (!ok) fallos++
  console.log(`  ${ok ? 'OK   ' : 'FALLA'} ${ruta.padEnd(24)} ${roto ? 'ErrorBoundary visible' : ''}`)
  for (const p of nuevos) console.log(`         ${p}`)
}

await browser.close()
console.log(fallos === 0 ? '\n✓ Sin fallas. Capturas en ' + SHOTS : `\n✗ ${fallos} vista(s) con problemas.`)
process.exit(fallos === 0 ? 0 : 1)
