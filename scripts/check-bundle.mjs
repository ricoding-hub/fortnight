#!/usr/bin/env node
/**
 * Comprueba que el bundle compilado contiene de verdad la aplicación.
 *
 * Suena absurdo hasta que pasa: `tsc -b` verde, 231 tests verdes, `vite build`
 * sin un solo aviso, y el artefacto resultante con cero líneas de la app dentro
 * — sólo React, Supabase y los iconos. Ocurrió en el contenedor de desarrollo y
 * la señal siguió en verde todo el tiempo, así que "el build pasó" dejó de
 * significar nada durante varias versiones.
 *
 * Estas cadenas son literales del código fuente que ningún minificador puede
 * renombrar. Si alguna falta, el bundle no sirve, y más vale romper aquí que
 * desplegar una pantalla en blanco.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist/assets'

/** Literales del código fuente, no identificadores: sobreviven a la minificación. */
const DEBE_CONTENER = [
  'catorcenal',      // src/lib/paydays.ts — frecuencias de pago
  'Liberar tarjetas',// src/hooks/useGoals.ts — meta sembrada
  'app-scroll',      // src/lib/appScroll.ts — contenedor de scroll
  'Sin conexión',    // src/components/PwaBanner.tsx
  'Movimientos',     // navegación
]

/** Por debajo de esto es imposible que quepan la app y sus dependencias. */
const MINIMO_KB = 600

function fallar(msg) {
  console.error(`\n✗ check-bundle: ${msg}\n`)
  process.exit(1)
}

let archivos
try {
  archivos = readdirSync(DIST).filter((f) => f.endsWith('.js'))
} catch {
  fallar(`no existe ${DIST}/ — ¿corrió vite build?`)
}
if (archivos.length === 0) fallar(`no hay ningún .js en ${DIST}/`)

const juntos = archivos.map((f) => readFileSync(join(DIST, f), 'utf8')).join('\n')
const kb = archivos.reduce((s, f) => s + statSync(join(DIST, f)).size, 0) / 1024

const faltan = DEBE_CONTENER.filter((s) => !juntos.includes(s))
if (faltan.length > 0) {
  fallar(
    `el bundle no contiene la aplicación.\n` +
      `  Faltan estas cadenas del código fuente: ${faltan.map((s) => `"${s}"`).join(', ')}\n` +
      `  Tamaño: ${kb.toFixed(0)} kB en ${archivos.length} archivo(s).\n` +
      `  Suele ser el tree-shaking tirando el grafo de la app entera.`,
  )
}
if (kb < MINIMO_KB) {
  fallar(`el bundle pesa ${kb.toFixed(0)} kB, por debajo del mínimo de ${MINIMO_KB} kB.`)
}

console.log(`✓ check-bundle: la app está en el bundle (${kb.toFixed(0)} kB, ${archivos.length} archivos)`)
