// @vitest-environment jsdom
import '@/test/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { APP_SCROLL_ID, lockAppScroll } from '@/lib/appScroll'
import { Modal } from '@/components/ui/Modal'

/** La app de verdad: un `<main id="app-scroll">` que es quien se desplaza. */
function conArmazon(ui: React.ReactElement) {
  const main = document.createElement('main')
  main.id = APP_SCROLL_ID
  document.body.appendChild(main)
  const vista = render(ui, { container: main })
  return { main, vista }
}

/** El modal se anima con dos rAF antes de quedar montado. */
async function asentar() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    })
  }
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('el modal vive fuera del scroller de la app', () => {
  it('no se dibuja dentro de #app-scroll', async () => {
    const { main } = conArmazon(
      <Modal open onClose={() => {}} title="Agregar meses">
        <button type="button">Agregar</button>
      </Modal>,
    )
    await asentar()

    const boton = screen.getByText('Agregar')
    expect(boton).toBeTruthy()
    // Este es el fallo entero: dentro del scroller, el bloqueo del fondo
    // cancelaba también el desplazamiento del modal.
    expect(main.contains(boton)).toBe(false)
    expect(document.body.contains(boton)).toBe(true)
  })
})

describe('con el fondo bloqueado, el modal sigue pudiendo desplazarse', () => {
  let desbloquear: () => void

  beforeEach(() => {
    document.body.innerHTML = ''
  })
  afterEach(() => desbloquear?.())

  it('un touchmove dentro del modal NO se cancela', async () => {
    // "El botón de agregar se va para abajo y no baja esa madre." El botón
    // estaba; lo que no había era forma de llegar a él. `lockAppScroll` engancha
    // un touchmove con preventDefault en #app-scroll, y mientras el modal se
    // dibujaba ahí dentro, sus propios touchmove burbujeaban hasta el bloqueo.
    const { main } = conArmazon(
      <Modal open onClose={() => {}} title="Agregar meses">
        <button type="button">Agregar</button>
      </Modal>,
    )
    await asentar()
    desbloquear = lockAppScroll()

    const dentroDelModal = screen.getByText('Agregar')
    const ev = new Event('touchmove', { bubbles: true, cancelable: true })
    dentroDelModal.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)

    // Y el fondo sí sigue congelado, que es para lo que está el bloqueo.
    const evFondo = new Event('touchmove', { bubbles: true, cancelable: true })
    main.dispatchEvent(evFondo)
    expect(evFondo.defaultPrevented).toBe(true)
  })
})

describe('con zoom el modal se coloca sobre lo que se ve', () => {
  function fingirZoom(escala: number, rect: { left: number; top: number; w: number; h: number }) {
    const oyentes: Record<string, (() => void)[]> = {}
    vi.stubGlobal('visualViewport', {
      scale: escala,
      offsetLeft: rect.left,
      offsetTop: rect.top,
      width: rect.w,
      height: rect.h,
      addEventListener: (t: string, f: () => void) => {
        ;(oyentes[t] ??= []).push(f)
      },
      removeEventListener: () => {},
    })
  }
  afterEach(() => vi.unstubAllGlobals())

  it('sin zoom no toca nada: se queda con el fixed inset-0 de siempre', async () => {
    fingirZoom(1, { left: 0, top: 0, w: window.innerWidth, h: window.innerHeight })
    conArmazon(
      <Modal open onClose={() => {}} title="Agregar meses">
        <button type="button">Agregar</button>
      </Modal>,
    )
    await asentar()
    const capa = document.querySelector('[role="dialog"]')!.closest('.fixed') as HTMLElement
    expect(capa.style.width).toBe('')
  })

  it('con zoom se ancla al rectángulo visible', async () => {
    // Un `position: fixed` se coloca respecto al viewport de maquetación, no al
    // visual. Al ampliar, el modal se quedaba fuera de cuadro con el telón
    // tapando la app: no se podía tocar nada. La salida fácil habría sido
    // prohibir el zoom, que incumple WCAG 2.1 SC 1.4.4.
    fingirZoom(2.5, { left: 120, top: 300, w: 180, h: 340 })
    conArmazon(
      <Modal open onClose={() => {}} title="Agregar meses">
        <button type="button">Agregar</button>
      </Modal>,
    )
    await asentar()

    const capa = document.querySelector('[role="dialog"]')!.parentElement!.parentElement as HTMLElement
    expect(capa.style.left).toBe('120px')
    expect(capa.style.top).toBe('300px')
    expect(capa.style.width).toBe('180px')
    expect(capa.style.height).toBe('340px')
    // Y el panel no puede ser más alto que lo que se ve.
    expect(capa.style.getPropertyValue('--modal-h')).toBe('340px')
  })
})
