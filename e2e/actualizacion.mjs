#!/usr/bin/env node
/**
 * El camino de actualización, probado de verdad y sin red.
 *
 * Esto es lo que nunca habíamos ejecutado. v1.7.5 no se cayó al escribir código
 * ni al consultar datos: se cayó **al actualizar**. El usuario pulsó Actualizar
 * y se quedó con una página en blanco. Ni `tsc`, ni los tests, ni el build
 * llegan a instalar un service worker, así que ninguno podía verlo.
 *
 * Dos escenarios:
 *
 *   1. Actualización normal. Se sirve la versión A, se espera a que el worker
 *      quede activo, se cambia el directorio servido por la versión B y se
 *      aplica la actualización. La app tiene que volver a arrancar.
 *
 *   2. Armazón viejo. El worker sirve el index.html de A — con las rutas de
 *      A a los scripts — mientras el servidor ya sólo tiene los de B. El script
 *      da 404, React no arranca y queda una página en blanco. Es exactamente
 *      el fallo que buscábamos, y la autocuración de `lib/recover` tiene que
 *      limpiar y recargar una vez para salir de ahí.
 *
 * No necesita Supabase: con las credenciales bloqueadas sale la pantalla de
 * acceso, y eso basta, porque lo que se comprueba es que el armazón arranca.
 *
 * Uso:  npm i -D playwright && node e2e/actualizacion.mjs
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { tmpdir } from 'node:os'

const RAIZ = process.cwd()
const TMP = mkdtempSync(join(tmpdir(), 'fortnight-act-'))
const SERVIDO = join(TMP, 'servido')
const A = join(TMP, 'a')
const B = join(TMP, 'b')

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

let fallos = 0
function comprobar(ok, mensaje) {
  console.log(`  ${ok ? 'OK   ' : 'FALLA'} ${mensaje}`)
  if (!ok) fallos++
}

/** Servidor estático mínimo sobre SERVIDO, con fallback a index.html. */
function servir() {
  const srv = createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    let ruta = join(SERVIDO, normalize(url.pathname))
    if (!ruta.startsWith(SERVIDO)) return res.writeHead(403).end()
    if (!existsSync(ruta) || url.pathname.endsWith('/')) {
      // Sólo las navegaciones caen al index; un asset que falta debe dar 404,
      // que es justo lo que pasa en un despliegue nuevo con un armazón viejo.
      if (extname(url.pathname)) return res.writeHead(404).end('no existe')
      ruta = join(SERVIDO, 'index.html')
    }
    res.writeHead(200, {
      'content-type': TIPOS[extname(ruta)] ?? 'application/octet-stream',
      // Sin caché de navegador: aquí se prueba el service worker, no el HTTP.
      'cache-control': 'no-store',
      // sw.js debe poder gobernar toda la raíz.
      'service-worker-allowed': '/',
    })
    res.end(readFileSync(ruta))
  })
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)))
}

function construir(destino, etiqueta) {
  console.log(`· construyendo ${etiqueta}…`)
  execFileSync('npm', ['run', 'build'], { cwd: RAIZ, stdio: 'pipe' })
  rmSync(destino, { recursive: true, force: true })
  cpSync(join(RAIZ, 'dist'), destino, { recursive: true })
}

/** Espera a que haya un service worker controlando la página. */
async function esperarWorker(page, ms = 15_000) {
  return page
    .waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: ms })
    .then(() => true)
    .catch(() => false)
}

const pintó = (page) =>
  page.evaluate(() => (document.getElementById('root')?.childElementCount ?? 0) > 0)

/**
 * Corta la tipografía de Google.
 *
 * En este entorno ese dominio no se alcanza y la petición se queda colgada, con
 * lo que el documento no termina de cargar y la prueba mediría la red del
 * contenedor en vez del camino de actualización. Abortarla es además el caso
 * real de alguien sin conexión: la app tiene que arrancar igual.
 */
async function sinTipografiaExterna(page) {
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort())
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort())
}

/* ── Preparación ──────────────────────────────────────────────────────────── */

construir(A, 'versión A')

// La versión B cambia de verdad: sin un cambio en el contenido las rutas del
// precaché serían idénticas y el worker nuevo ni siquiera se instalaría.
const marcador = join(RAIZ, 'public', '__e2e_b.txt')
mkdirSync(join(RAIZ, 'public'), { recursive: true })
execFileSync('bash', ['-c', `echo "version-b-${Date.now()}" > ${JSON.stringify(marcador)}`])
try {
  construir(B, 'versión B')
} finally {
  rmSync(marcador, { force: true })
}

mkdirSync(SERVIDO, { recursive: true })
cpSync(A, SERVIDO, { recursive: true })

const srv = await servir()
const BASE = `http://127.0.0.1:${srv.address().port}`
console.log(`→ ${BASE}\n`)

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

/* ── Escenario 1: actualización normal ────────────────────────────────────── */

console.log('1 · actualización normal (A → B)')
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } })
  const page = await ctx.newPage()
  await sinTipografiaExterna(page)

  await page.goto(BASE, { waitUntil: 'load' })
  comprobar(await esperarWorker(page), 'el service worker de A toma el control')
  comprobar(await pintó(page), 'la app arranca con A')

  // Llega el despliegue nuevo.
  rmSync(SERVIDO, { recursive: true, force: true })
  mkdirSync(SERVIDO, { recursive: true })
  cpSync(B, SERVIDO, { recursive: true })

  // Lo que hace el botón Actualizar: pedir el worker nuevo y aplicarlo.
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    await reg?.update()
  })
  await page.waitForTimeout(2500)
  // Lo mismo que hace `updateSW(true)` por dentro: decirle al worker en espera
  // que deje de esperar. Se habla el protocolo en vez de exponer un gancho de
  // pruebas en el código de producción.
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    reg?.waiting?.postMessage({ type: 'SKIP_WAITING' })
  })
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1500)

  comprobar(await pintó(page), 'la app sigue arrancando después de actualizar')
  await ctx.close()
}

/* ── Escenario 2: armazón viejo sobre un despliegue nuevo ─────────────────── */

console.log('\n2 · armazón viejo: el index de A con los assets de B')
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } })
  const page = await ctx.newPage()
  await sinTipografiaExterna(page)

  // Sólo la PRIMERA navegación recibe el armazón viejo, igual que cuando un
  // worker atascado sirve su copia del index. Tras limpiar cachés y recargar, la
  // segunda ya recibe el del servidor, que es lo que debe recuperar la app.
  //
  // El armazón apunta a unos assets que el servidor ya no tiene: es lo que pasa
  // en cada despliegue, porque el nombre de cada archivo lleva el hash de su
  // contenido y al cambiar el código cambia el nombre. Un index cacheado de
  // hace dos versiones pide archivos que ya no existen.
  let servidas = 0
  const indexViejo = readFileSync(join(B, 'index.html'), 'utf8').replace(
    /\/assets\/(index-[^."]+)\.(js|css)/g,
    '/assets/$1-DE-OTRA-VERSION.$2',
  )
  if (!indexViejo.includes('DE-OTRA-VERSION')) {
    console.error('  ! el armazón de prueba no quedó apuntando a nada roto')
    fallos++
  }
  await page.route(`${BASE}/`, async (route) => {
    if (servidas++ === 0) {
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: indexViejo })
    } else {
      await route.continue()
    }
  })

  // La consola es la prueba de que la red de arranque se disparó, así que se ve.
  page.on('console', (m) => {
    if (/Fortnight/.test(m.text())) console.log(`      ${m.text().slice(0, 120)}`)
  })
  await page.goto(BASE, { waitUntil: 'load' })
  // El script de A no existe en B: 404, React no arranca, pantalla en blanco.
  await page.waitForTimeout(8000)

  comprobar(servidas > 1, 'la autocuración detectó el bundle roto y recargó')
  comprobar(await pintó(page), 'la app se recuperó sola de la pantalla en blanco')
  await page.screenshot({ path: 'e2e/capturas/actualizacion-recuperada.png' }).catch(() => {})
  await ctx.close()
}

await browser.close()
srv.close()
rmSync(TMP, { recursive: true, force: true })

console.log(fallos === 0 ? '\n✓ El camino de actualización aguanta.' : `\n✗ ${fallos} comprobación(es) fallaron.`)
process.exit(fallos === 0 ? 0 : 1)
