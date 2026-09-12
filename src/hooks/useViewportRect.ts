import { type CSSProperties, useCallback, useSyncExternalStore } from 'react'

export interface ViewportRect {
  left: number
  top: number
  width: number
  height: number
}

/** Por debajo de esto es ruido de coma flotante, no zoom del usuario. */
const UMBRAL_ZOOM = 1.01

/**
 * Instantánea memorizada.
 *
 * `useSyncExternalStore` compara la referencia que devuelve `getSnapshot`, así
 * que un objeto nuevo en cada llamada lo mete en un bucle infinito. Sólo se
 * crea uno cuando alguno de los cuatro números cambia de verdad.
 */
let ultima: ViewportRect | null = null

function medir(): ViewportRect | null {
  const vv = typeof window === 'undefined' ? null : window.visualViewport
  // Sin zoom se devuelve null a propósito: el modal usa entonces sus clases
  // normales y no queda atado a medidas en píxeles que habría que mantener
  // sincronizadas en cada rotación o cambio de barra del navegador.
  if (!vv || (vv.scale <= UMBRAL_ZOOM && vv.height >= window.innerHeight - 1)) {
    ultima = null
    return null
  }
  const { offsetLeft: left, offsetTop: top, width, height } = vv
  if (
    ultima &&
    ultima.left === left &&
    ultima.top === top &&
    ultima.width === width &&
    ultima.height === height
  ) {
    return ultima
  }
  ultima = { left, top, width, height }
  return ultima
}

function suscribir(avisar: () => void): () => void {
  const vv = typeof window === 'undefined' ? null : window.visualViewport
  if (!vv) return () => {}
  vv.addEventListener('resize', avisar)
  vv.addEventListener('scroll', avisar)
  return () => {
    vv.removeEventListener('resize', avisar)
    vv.removeEventListener('scroll', avisar)
  }
}

/**
 * El rectángulo que el usuario ve de verdad, o null mientras no haya zoom.
 *
 * Un elemento `position: fixed` se coloca respecto al *viewport de maquetación*,
 * no al *visual*. Al hacer pinch-zoom, el visual se encoge y se desplaza pero el
 * modal sigue anclado al otro: acabas viendo un trozo del telón oscuro, con el
 * panel fuera de cuadro y sin poder tocar nada, porque el telón tapa la app.
 *
 * La salida fácil sería prohibir el zoom con `maximum-scale=1`. No se hace:
 * para mucha gente ampliar es la única forma de leer cifras, y bloquearlo
 * incumple WCAG 2.1 SC 1.4.4, que exige poder llegar al 200 %. Lo correcto es
 * que el modal siga al viewport visual, y eso es lo que sirve esto.
 *
 * De regalo, el teclado del móvil encoge el viewport visual igual que el zoom,
 * así que el panel deja de quedarse debajo de él.
 *
 * `useSyncExternalStore` y no `useState` + efecto: esto es exactamente una
 * fuente externa a la que suscribirse, y así la primera medida entra en el
 * primer render en vez de provocar un segundo.
 */
export function useViewportRect(activo: boolean): ViewportRect | null {
  const snapshot = useCallback(() => (activo ? medir() : null), [activo])
  return useSyncExternalStore(suscribir, snapshot, () => null)
}

/**
 * Estilo que coloca una capa fija sobre el viewport visual.
 *
 * `--modal-h` la consume el panel con `max-h-[var(--modal-h,90dvh)]`: sin zoom
 * la variable no existe y se queda el valor de siempre.
 */
export function estiloDeCapa(rect: ViewportRect | null): CSSProperties | undefined {
  if (!rect) return undefined
  return {
    position: 'fixed',
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: 'auto',
    bottom: 'auto',
    ['--modal-h' as string]: `${rect.height}px`,
  }
}
