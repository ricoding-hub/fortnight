// @vitest-environment jsdom
/**
 * «Paga MercadoPago hoy · $8,110.75» — el aviso de Tony.
 *
 * El aviso ponía el saldo completo de la tarjeta (con todas las mensualidades
 * MSI que aún no se cobran) y no sabía si ya habías pagado. Ahora dice lo que
 * FALTA del estado de cuenta, desaparece al pagar y «Pagar» registra un pago de
 * verdad.
 */
import '@/test/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { crearSupabaseDoble, type Filas } from '@/test/supabaseDoble'
import { asentar, esperarA } from '@/test/espera'

let doble = crearSupabaseDoble()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return doble.cliente
  },
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 3, 12)) // 3 nov: el pago vence el 5
  localStorage.setItem('fortnight_tour_seen', '1')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})

const MP = {
  id: 'mp', user_id: 'u-1', name: 'MercadoPago', type: 'credit', balance: '10000', credit_limit: '20000',
  cut_day: 15, payment_due_day: 5, payment_grace_days: null, min_payment_pct: null, cost_type: 'con_costo',
  prepay_buffer: '0', sort_order: 1, source: 'manual', color: null, logo_domain: null,
  created_at: '2026-01-10T18:00:00Z', updated_at: '',
}
const BBVA = {
  id: 'bbva', user_id: 'u-1', name: 'BBVA', type: 'debit', balance: '15000', credit_limit: null,
  cut_day: null, payment_due_day: null, payment_grace_days: null, sort_order: 0, source: 'manual',
  color: null, logo_domain: null, prepay_buffer: '0', created_at: '2026-01-10T18:00:00Z', updated_at: '',
}
const mov = (id: string, amount: number, date: string, extra: Record<string, unknown> = {}) => ({
  id, user_id: 'u-1', account_id: 'mp', amount: String(amount), date, type: 'transaction', category_id: null,
  description: null, installment_id: null, created_at: `${date}T18:00:00Z`, source: 'manual', ...extra,
})
const PLAN = {
  id: 'p1', user_id: 'u-1', account_id: 'mp', name: 'Tele', total_amount: '6000', monthly_amount: '1000',
  months_total: 6, months_paid: 0, start_date: '2026-09-20', status: 'active', is_zero_interest: true,
  created_at: '2026-09-20T18:00:00Z', updated_at: '', month_status: { _v: 2 }, billing_offset: 0,
}
const BASE = [
  mov('t1', 1500, '2026-09-16'),
  mov('msi', 6000, '2026-09-20', { type: 'installment', installment_id: 'p1' }),
  mov('t2', 2500, '2026-10-10'),
]

function tablas(over: { saldo?: string; movs?: unknown[] } = {}): Filas {
  return {
    accounts: [BBVA, { ...MP, balance: over.saldo ?? MP.balance }],
    transactions: over.movs ?? BASE,
    installments: [PLAN],
    categories: [],
    user_config: [],
    card_statements: [],
  }
}

async function montar(t: Filas, errores: Record<string, { message: string; code?: string }> = {}) {
  doble = crearSupabaseDoble({ tablas: t, errores })
  const { Layout } = await import('@/components/Layout')
  const { Resumen } = await import('@/views/Resumen')
  const { AuthProvider } = await import('@/hooks/useAuth')
  const { GoalsProvider } = await import('@/hooks/useGoals')
  const { BudgetPlanProvider } = await import('@/hooks/useBudgetPlan')
  render(
    <AuthProvider>
      <GoalsProvider>
        <BudgetPlanProvider>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Resumen />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </BudgetPlanProvider>
      </GoalsProvider>
    </AuthProvider>,
  )
  await esperarA(/Balance neto|Algo se rompió/)
  await asentar(30)
}

const aviso = () => screen.queryByRole('region', { name: 'Pago próximo' })

describe('el aviso de pago de Inicio', () => {
  it('dice lo que falta para no generar intereses, no el saldo completo', { timeout: 30_000 }, async () => {
    await montar(tablas())
    const a = aviso()!
    expect(a).toBeTruthy()
    expect(within(a).getByText('MercadoPago en 2 días')).toBeTruthy()
    expect(a.textContent).toMatch(/\$5,000\.00 para no generar intereses/)
    expect(a.textContent).not.toMatch(/10,000/)
  })

  it('con el estado pagado, ya no aparece', { timeout: 30_000 }, async () => {
    await montar(tablas({ saldo: '5000', movs: [...BASE, mov('p', -5000, '2026-11-02', { type: 'transfer', transfer_id: 'x' })] }))
    expect(aviso()).toBeNull()
  })

  it('con un pago parcial, dice lo que falta', { timeout: 30_000 }, async () => {
    await montar(tablas({ saldo: '5500', movs: [...BASE, mov('p', -4500, '2026-11-02', { type: 'transfer', transfer_id: 'x' })] }))
    expect(aviso()?.textContent).toMatch(/\$500\.00 para no generar intereses/)
  })

  it('«Pagar» registra un pago desde la cuenta de débito, no un gasto', { timeout: 30_000 }, async () => {
    await montar(tablas())
    await act(async () => {
      fireEvent.click(within(aviso()!).getByRole('button', { name: 'Pagar' }))
    })
    await asentar(10)
    const opcion = screen.getByRole('radio', { name: /Para no generar intereses/ })
    expect(opcion.getAttribute('aria-checked')).toBe('true')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Pagar \$5,000\.00/ }))
    })
    await asentar(6)
    const pago = doble.llamadas.find((l) => l.tabla === 'transactions' && l.op === 'insert')
    const filas = pago?.payload as Array<{ account_id: string; amount: number; type: string }>
    expect(filas.map((f) => [f.account_id, f.amount, f.type])).toEqual([
      ['mp', -5000, 'transfer'],
      ['bbva', -5000, 'transfer'],
    ])
  })

  it('sin la tabla de correcciones (migración 038) la pantalla no se rompe', { timeout: 30_000 }, async () => {
    await montar(tablas(), { card_statements: { message: 'relation does not exist', code: 'PGRST205' } })
    expect(aviso()?.textContent).toMatch(/\$5,000\.00/)
  })
})
