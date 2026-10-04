import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Dibuja `children` en el pie fijo del `Modal`.
 *
 * El botón principal de un formulario tiene que vivir FUERA del área que se
 * desplaza, pero el formulario (y su estado: si está enviando, si es válido)
 * vive dentro. Un portal al contenedor del pie resuelve las dos cosas sin subir
 * el estado: el botón se asocia al <form> con `form="..."` y el navegador se
 * encarga de enviarlo.
 *
 * Devuelve null mientras el pie no existe (el primer render del modal).
 */
export function FooterPortal({ target, children }: { target: HTMLElement | null; children: ReactNode }) {
  return target ? createPortal(children, target) : null
}
