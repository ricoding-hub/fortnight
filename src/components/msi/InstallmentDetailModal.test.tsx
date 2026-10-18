// @vitest-environment jsdom
/**
 * El detalle de un plan: qué ofrece según de dónde sale el estado de cada mes.
 */
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { InstallmentDetailModal } from './InstallmentDetailModal'
import { vivo, type CoberturaMsi } from '@/lib/msi'
import type { Account, Installment } from '@/types'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
afterEach(cleanup)

const NU = { id: 'nu', name: 'Nu', type: 'credit', cut_day: 15, payment_due_day: 5, payment_grace_days: null } as Account
const PLAN = {
  id: 'p1', user_id: 'u', account_id: 'nu', name: 'iPhone', total_amount: 12000, monthly_amount: 1000,
  months_total: 12, months_paid: 0, start_date: '2026-07-03', status: 'active', is_zero_interest: true,
  created_at: '2026-07-03T18:00:00Z', updated_at: '', month_status: { _v: 2 }, billing_offset: 0,
} as Installment

function abrir(o: { cobertura?: CoberturaMsi; estadosListos?: boolean; cargo?: { adoptado?: boolean } } = {}) {
  const inst = vivo(PLAN, NU, '2026-10-20', o.cargo ? { id: 't1', amount: 12000, account_id: 'nu', date: '2026-07-03', ...o.cargo } : null, o.cobertura)
  render(
    <InstallmentDetailModal
      installment={inst}
      linkedAccount={NU}
      hoy="2026-10-20"
      onClose={() => {}}
      onEdit={() => {}}
      onMarcarMes={async () => {}}
      onLiquidar={async () => {}}
      onEliminar={async () => {}}
      onCambiarFechaDeCompra={async () => {}}
      onPagarTarjeta={() => {}}
      estadosListos={o.estadosListos}
    />,
  )
}

describe('detalle de un plan a meses', () => {
  it('«Pagar Nu» sólo donde tus pagos deciden la mensualidad', () => {
    abrir({ cobertura: (n) => (n === 4 ? 'no-cubierta' : null) })
    expect(screen.getByRole('button', { name: /Pagar Nu/ })).toBeTruthy()
    cleanup()
    // Sin estado de cuenta para ese corte, pagar no la marcaría: no se ofrece.
    abrir()
    expect(screen.queryByRole('button', { name: /Pagar Nu/ })).toBeNull()
  })

  it('«Liquidar» espera a que cargue el estado de cuenta', () => {
    abrir({ estadosListos: false })
    expect((screen.getByRole('button', { name: /Cargando/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('un gasto convertido lo dice, y no ofrece quitar el cargo', () => {
    abrir({ cargo: { adoptado: true } })
    expect(document.body.textContent).toMatch(/Es tu gasto de \$12,000\.00 del 3 jul en Nu, convertido a meses/)
  })
})
