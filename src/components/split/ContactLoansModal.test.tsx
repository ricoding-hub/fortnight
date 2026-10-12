// @vitest-environment jsdom
/**
 * Lo que vio Juan: la ficha de «Richy» con sus préstamos, y ninguna forma de
 * invitarlo. Ahora la ficha ofrece conectarse.
 */
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { crearSupabaseDoble } from '@/test/supabaseDoble'
import { ContactLoansModal } from './ContactLoansModal'

const doble = crearSupabaseDoble()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return doble.cliente
  },
}))

afterEach(cleanup)

const noop = () => {}

function montar(onInvitar?: () => Promise<void>) {
  render(
    <ContactLoansModal
      open
      onClose={noop}
      name="Richy"
      net={1195}
      activeLoans={[]}
      paidLoans={[]}
      paymentsByLoan={{}}
      onOpenLoan={noop}
      onAbono={noop}
      onMarkPaid={noop}
      onEdit={noop}
      onDelete={noop}
      onUnmarkPaid={noop}
      onInvitar={onInvitar}
    />,
  )
}

describe('ContactLoansModal — invitar', () => {
  it('ofrece invitar a la persona a conectarse', async () => {
    const invitar = vi.fn(() => Promise.resolve())
    montar(invitar)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Invitar a Richy a conectarse' }))
    })
    expect(invitar).toHaveBeenCalledOnce()
  })

  it('si falla, lo dice y deja reintentar', async () => {
    montar(() => Promise.reject(new Error('red')))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Invitar a Richy a conectarse' }))
    })
    expect(screen.getByText(/No se pudo preparar la invitación/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Invitar a Richy a conectarse' })).toBeTruthy()
  })

  it('sin modo multiusuario no promete nada', () => {
    montar(undefined)
    expect(screen.queryByRole('button', { name: /Invitar/ })).toBeNull()
  })
})
