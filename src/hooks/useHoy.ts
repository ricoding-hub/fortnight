import { useSyncExternalStore } from 'react'
import { toKey } from '@/lib/localDate'

/**
 * El día local de hoy (`YYYY-MM-DD`) que cambia solo a medianoche.
 *
 * Una PWA se queda abierta días. Sin esto, «mensualidad 4 de 12» y el
 * calendario se quedaban en el día en que se abrió la app. Un solo temporizador
 * para toda la app, y además se revisa al volver a la app (`visibilitychange`,
 * `focus`), porque los temporizadores se congelan con el teléfono bloqueado.
 */
const oyentes = new Set<() => void>()
let temporizador: ReturnType<typeof setTimeout> | null = null
let ultimo = toKey(new Date())

function avisarSiCambio() {
  const ahora = toKey(new Date())
  if (ahora !== ultimo) {
    ultimo = ahora
    oyentes.forEach((f) => f())
  }
}

function armar() {
  if (temporizador) clearTimeout(temporizador)
  const ahora = new Date()
  const manana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 0, 0, 5)
  temporizador = setTimeout(() => {
    avisarSiCambio()
    armar()
  }, manana.getTime() - ahora.getTime())
}

function alVolver() {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') avisarSiCambio()
}

function suscribir(f: () => void) {
  oyentes.add(f)
  if (oyentes.size === 1) {
    armar()
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
  }
  return () => {
    oyentes.delete(f)
    if (oyentes.size === 0) {
      if (temporizador) clearTimeout(temporizador)
      temporizador = null
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
    }
  }
}

function leer() {
  // Un render puede llegar antes que el temporizador (al volver de segundo plano).
  const ahora = toKey(new Date())
  if (ahora !== ultimo) ultimo = ahora
  return ultimo
}

export function useHoy(): string {
  return useSyncExternalStore(suscribir, leer, leer)
}
