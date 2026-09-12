import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Portal a `document.body`, donde viven los modales.
 *
 * No es cosmético. Los modales se dibujaban dentro de `<main id="app-scroll">`,
 * y al abrirse `lockAppScroll` engancha en ese elemento un `touchmove` que llama
 * a `preventDefault` para congelar el fondo. Un `touchmove` hecho dentro del
 * modal **burbujea hasta ahí**, así que ese bloqueo cancelaba también el
 * desplazamiento del propio modal. De ahí el reporte: "el botón de agregar se va
 * para abajo y no baja esa madre". El botón estaba; lo que no había era forma de
 * llegar a él. Lo mismo con la rueda del ratón en escritorio.
 *
 * Fuera del scroller, los eventos del modal ya no pasan por el bloqueo y el
 * fondo sigue congelado. La posición la pone quien lo usa, con `useViewportRect`.
 */
export function ModalLayer({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
