import { isStandalone } from '@/lib/platform'

/**
 * Cómo quedó la barra de estado de iOS en la app instalada.
 *
 * iOS lee `apple-mobile-web-app-status-bar-style` UNA vez, al agregar la app a
 * la pantalla de inicio. Con el valor viejo (`black-translucent`) la página
 * corre debajo de la barra, y desde iOS 26 el sistema pinta encima un borde de
 * cristal borroso que ninguna regla de CSS apaga. Con `default` (desde v1.11.0)
 * la página empieza debajo de una barra opaca y no hay cristal.
 *
 * La forma de saberlo desde dentro: con la barra translúcida, el área segura de
 * arriba mide lo que la barra (unos 50 px); con la estándar, mide 0.
 */
export type ModoBarra = 'navegador' | 'estandar' | 'translucida'

export function decidirModoBarra(o: { instalada: boolean; vertical: boolean; insetArriba: number }): ModoBarra {
  if (!o.instalada) return 'navegador'
  // En horizontal la barra de estado no se muestra: no hay nada que medir.
  if (!o.vertical) return 'estandar'
  return o.insetArriba > 0.5 ? 'translucida' : 'estandar'
}

/** Mide `env(safe-area-inset-top)` con una sonda invisible. */
export function insetSuperior(): number {
  if (typeof document === 'undefined') return 0
  const sonda = document.createElement('div')
  sonda.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)'
  document.body.appendChild(sonda)
  const valor = Number.parseFloat(getComputedStyle(sonda).paddingTop) || 0
  sonda.remove()
  return valor
}

export function modoBarra(): ModoBarra {
  if (typeof window === 'undefined') return 'navegador'
  return decidirModoBarra({
    instalada: isStandalone(),
    vertical: window.innerHeight >= window.innerWidth,
    insetArriba: insetSuperior(),
  })
}
