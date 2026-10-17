// @vitest-environment jsdom
/**
 * «Lo de los meses los dejo a 1 solo pago»: una compra a meses anotada como
 * gasto normal se convierte desde su detalle, sin cargarla otra vez.
 */
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TransactionDetailModal } from './TransactionDetailModal'
import { useUiStore } from '@/store/uiStore'
import type { Account, Category, Transaction } from '@/types'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
afterEach(() => {
  cleanup()
  useUiStore.setState({ aMeses: null })
})

const NU = { id: 'c1', name: 'Nu', type: 'credit' } as Account
const BBVA = { id: 'd1', name: 'BBVA', type: 'debit' } as Account
const COMIDA = { id: 'k1', name: 'Comida', kind: 'variable' } as Category
const tx = (o: Partial<Transaction>) =>
  ({
    id: 't1', account_id: 'c1', amount: 12000, category_id: 'k1', description: 'iPhone', date: '2026-10-10',
    type: 'transaction', source: 'manual', created_at: '2026-10-10T20:00:00Z', ...o,
  }) as Transaction

function abrir(t: Transaction, cuenta: Account) {
  render(
    <MemoryRouter>
      <TransactionDetailModal transaction={t} account={cuenta} category={COMIDA} onClose={() => {}} onDelete={async () => {}} />
    </MemoryRouter>,
  )
}

describe('convertir un gasto de tarjeta a meses', () => {
  it('abre la compra a meses con ese gasto, para convertirlo', async () => {
    abrir(tx({}), NU)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Fue a meses: convertir/ }))
    })
    expect(useUiStore.getState().aMeses).toEqual({ txId: 't1', name: 'iPhone', total: 12000, date: '2026-10-10', accountId: 'c1' })
  })

  it('no se ofrece en débito, en un pago ni en un cargo que ya es de un plan', () => {
    abrir(tx({ account_id: 'd1', amount: -500 }), BBVA)
    expect(screen.queryByRole('button', { name: /Fue a meses/ })).toBeNull()
    cleanup()
    abrir(tx({ amount: -500, category_id: null, type: 'transfer', transfer_id: 'x' }), NU)
    expect(screen.queryByRole('button', { name: /Fue a meses/ })).toBeNull()
    cleanup()
    abrir(tx({ type: 'installment', installment_id: 'p1' }), NU)
    expect(screen.queryByRole('button', { name: /Fue a meses/ })).toBeNull()
  })
})
