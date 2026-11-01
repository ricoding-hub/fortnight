// @vitest-environment jsdom
/**
 * Los ajustes de una tarjeta: el pago mínimo (%) y el estado de cuenta
 * calculado, que va apagado por omisión (modo ligero).
 */
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AccountFormModal } from './AccountFormModal'
import type { Account } from '@/types'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
afterEach(cleanup)

const NU = {
  id: 'nu', user_id: 'u-1', name: 'Nu', type: 'credit', balance: 4000, credit_limit: 20000, cut_day: 12,
  payment_due_day: 2, payment_grace_days: null, min_payment_pct: null, color: null, logo_domain: null,
  source: 'manual', sort_order: 1, created_at: '', updated_at: '',
} as unknown as Account

function abrir(account: Account = NU) {
  const onUpdate = vi.fn(async (_id: string, _patch: Record<string, unknown>) => {
    void _id
    void _patch
  })
  render(
    <AccountFormModal mode={{ kind: 'edit', account }} onClose={() => {}} onCreate={async () => {}} onUpdate={onUpdate} onDelete={async () => {}} />,
  )
  return onUpdate
}

const guardar = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  })
}

describe('pago mínimo de la tarjeta', () => {
  it('se guarda como porcentaje', async () => {
    const onUpdate = abrir()
    fireEvent.change(screen.getByLabelText('Pago mínimo (% del saldo)'), { target: { value: '3,5' } })
    await guardar()
    expect(onUpdate).toHaveBeenCalledWith('nu', expect.objectContaining({ min_payment_pct: 3.5 }))
  })

  it('vacío queda sin capturar (se supone 1.5 %)', async () => {
    const onUpdate = abrir()
    await guardar()
    expect(onUpdate).toHaveBeenCalledWith('nu', expect.objectContaining({ min_payment_pct: null }))
  })

  it('un porcentaje imposible no se guarda', async () => {
    const onUpdate = abrir()
    fireEvent.change(screen.getByLabelText('Pago mínimo (% del saldo)'), { target: { value: '150' } })
    await guardar()
    expect(screen.getByText('Un porcentaje entre 0.1 y 100')).toBeTruthy()
    expect(onUpdate).not.toHaveBeenCalled()
  })
})

describe('estado de cuenta calculado', () => {
  it('va apagado por omisión y no se manda si no cambia', async () => {
    const onUpdate = abrir()
    expect(screen.getByRole('switch', { name: 'Calcular mi estado de cuenta' }).getAttribute('aria-checked')).toBe('false')
    await guardar()
    expect(onUpdate.mock.calls[0][1]).not.toHaveProperty('track_statement')
  })

  it('encenderlo lo guarda y explica cuándo sirve', async () => {
    const onUpdate = abrir()
    fireEvent.click(screen.getByRole('switch', { name: 'Calcular mi estado de cuenta' }))
    expect(screen.getByText(/Sólo sale bien si registras todos los movimientos/)).toBeTruthy()
    await guardar()
    expect(onUpdate).toHaveBeenCalledWith('nu', expect.objectContaining({ track_statement: true }))
  })
})
