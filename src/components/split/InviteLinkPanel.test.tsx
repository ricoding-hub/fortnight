// @vitest-environment jsdom
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { InviteLinkPanel } from './InviteLinkPanel'

const LINK = 'https://fortnight.app/join/abc'

function montar() {
  render(<InviteLinkPanel link={LINK} tituloCompartir="Únete" explicacion="Explicación" />)
}

function stubs(share?: (d: ShareData) => Promise<void>, write = vi.fn(() => Promise.resolve())) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true })
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
  return write
}

afterEach(() => {
  cleanup()
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
})

describe('InviteLinkPanel', () => {
  it('el enlace se ve escrito', () => {
    stubs()
    montar()
    expect(screen.getByDisplayValue(LINK)).toBeTruthy()
  })

  it('cancelar la hoja de compartir no copia a escondidas', async () => {
    const write = stubs(() => Promise.reject(new DOMException('cancel', 'AbortError')))
    montar()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Compartir/ }))
    })
    expect(write).not.toHaveBeenCalled()
    expect(screen.queryByText('Copiado')).toBeNull()
  })

  it('si compartir falla de verdad, copia y lo dice', async () => {
    const write = stubs(() => Promise.reject(new Error('no disponible')))
    montar()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Compartir/ }))
    })
    expect(write).toHaveBeenCalledWith(LINK)
    expect(screen.getByText('Copiado')).toBeTruthy()
  })

  it('sin hoja nativa, copiar es la acción principal', async () => {
    const write = stubs(undefined)
    montar()
    expect(screen.queryByRole('button', { name: /Compartir/ })).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copiar/ }))
    })
    expect(write).toHaveBeenCalledWith(LINK)
  })

  it('si el portapapeles falla, deja el enlace seleccionado para copiarlo a mano', async () => {
    stubs(undefined, vi.fn(() => Promise.reject(new Error('denegado'))))
    montar()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copiar/ }))
    })
    expect(screen.getByText(/cópialo tú/)).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByDisplayValue(LINK))
  })
})
