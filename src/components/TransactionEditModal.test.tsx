// @vitest-environment jsdom
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TransactionEditModal } from './TransactionEditModal'
import type { Account, Category, Transaction } from '@/types'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
afterEach(cleanup)

const BBVA = { id: 'd1', name: 'BBVA', type: 'debit' } as Account
const NU = { id: 'c1', name: 'Nu', type: 'credit' } as Account
const CATS = [
  { id: 'k1', name: 'Comida', kind: 'variable' },
  { id: 'k2', name: 'Salario', kind: 'income' },
] as Category[]
const GASTO = {
  id: 't1', account_id: 'd1', amount: -200, category_id: 'k1', description: 'Tacos', date: '2026-10-10',
  type: 'transaction', source: 'manual', created_at: '2026-10-10T20:00:00Z',
} as Transaction

function abrir(tx: Transaction = GASTO) {
  const onSave = vi.fn(async () => {})
  render(<TransactionEditModal transaction={tx} accounts={[BBVA, NU]} categories={CATS} onClose={() => {}} onSave={onSave} />)
  return onSave
}

const guardar = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  })
}

describe('editar un movimiento', () => {
  it('cambia el monto y dice qué pasa con el saldo', async () => {
    const onSave = abrir()
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '250' } })
    expect(screen.getByText('El saldo de BBVA baja $50.00.')).toBeTruthy()
    await guardar()
    expect(onSave).toHaveBeenCalledWith('t1', expect.objectContaining({ amount: -250, account_id: 'd1' }))
  })

  it('moverlo a una tarjeta recalcula el signo: un gasto sube la deuda', async () => {
    const onSave = abrir()
    fireEvent.change(screen.getByLabelText('Cuenta'), { target: { value: 'c1' } })
    await guardar()
    expect(onSave).toHaveBeenCalledWith('t1', expect.objectContaining({ amount: 200, account_id: 'c1' }))
  })

  it('uno del banco sólo deja cambiar categoría y nota', async () => {
    const onSave = abrir({ ...GASTO, source: 'syncfy' })
    expect(screen.queryByLabelText('Monto')).toBeNull()
    fireEvent.change(screen.getByLabelText('Nota (opcional)'), { target: { value: 'Súper' } })
    await guardar()
    expect(onSave).toHaveBeenCalledWith('t1', { category_id: 'k1', description: 'Súper' })
  })

  it('si falla, lo dice sin cerrar', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('Para cambiar el monto o la cuenta, corre la migración 036 en Supabase.')
    })
    render(<TransactionEditModal transaction={GASTO} accounts={[BBVA, NU]} categories={CATS} onClose={() => {}} onSave={onSave} />)
    await guardar()
    expect(screen.getByText(/corre la migración 036/)).toBeTruthy()
  })
})
