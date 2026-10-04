import { act } from '@testing-library/react'

/**
 * Esperas explícitas para las pruebas de render.
 *
 * A mano y no con `waitFor`: en la primera prueba de un archivo, mientras vitest
 * resuelve los imports dinámicos, `waitFor` puede resolver antes de que el árbol
 * pinte nada y la comprobación siguiente mira un DOM vacío. Un bucle explícito
 * no tiene esa carrera.
 */

/** Deja que se resuelvan las consultas y los efectos que dependen de ellas. */
export async function asentar(vueltas = 24, ms = 20): Promise<void> {
  for (let i = 0; i < vueltas; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, ms))
    })
  }
}

/** Espera a que el texto de la página cumpla el patrón, o falla diciendo qué había. */
export async function esperarA(patron: RegExp, msTotal = 10_000): Promise<void> {
  const limite = Date.now() + msTotal
  while (Date.now() < limite) {
    if (patron.test(document.body.textContent ?? '')) return
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25))
    })
  }
  throw new Error(
    `Nunca apareció ${patron}. En pantalla: "${(document.body.textContent ?? '').slice(0, 300)}"`,
  )
}
