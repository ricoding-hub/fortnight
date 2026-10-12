// @vitest-environment jsdom
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useHoy } from './useHoy'

function Hoy() {
  return <p>{useHoy()}</p>
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useHoy', () => {
  it('cambia de día a medianoche sin recargar', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 12, 23, 59, 0))
    render(<Hoy />)
    expect(screen.getByText('2026-10-12')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000)
    })
    expect(screen.getByText('2026-10-13')).toBeTruthy()
  })
})
