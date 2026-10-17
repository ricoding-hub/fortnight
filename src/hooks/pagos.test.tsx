// @vitest-environment jsdom
/**
 * Pagos de tarjeta y préstamos pagados con tarjeta: qué se escribe.
 */
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { crearSupabaseDoble, type Filas } from '@/test/supabaseDoble'
import { asentar } from '@/test/espera'

let doble = crearSupabaseDoble()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return doble.cliente
  },
}))
let conPagos = true
vi.mock('@/lib/esquema', async (original) => ({
  ...(await original<typeof import('@/lib/esquema')>()),
  tieneEsquemaPagos: () => Promise.resolve(conPagos),
}))

afterEach(() => {
  cleanup()
  conPagos = true
})

async function montar<T>(hook: () => T, tablas: Filas = {}, errores: Record<string, { message: string; code?: string }> = {}) {
  doble = crearSupabaseDoble({ tablas, errores })
  const { AuthProvider } = await import('@/hooks/useAuth')
  const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>
  const r = renderHook(hook, { wrapper })
  await asentar(6)
  return r
}

describe('usePagarTarjeta', () => {
  it('un pago son dos partes del mismo dinero, en un solo insert', async () => {
    const { usePagarTarjeta } = await import('./usePagarTarjeta')
    const { result } = await montar(() => usePagarTarjeta())
    await act(async () => {
      await result.current.pagar({
        card: { id: 'mp', name: 'MercadoPago' },
        amount: 5000,
        from: { id: 'bbva', name: 'BBVA' },
        date: '2026-10-01',
      })
    })
    const inserts = doble.llamadas.filter((l) => l.tabla === 'transactions' && l.op === 'insert')
    expect(inserts).toHaveLength(1)
    const filas = inserts[0].payload as Array<Record<string, unknown>>
    expect(filas.map((f) => [f.account_id, f.amount, f.type])).toEqual([
      ['mp', -5000, 'transfer'],
      ['bbva', -5000, 'transfer'],
    ])
    expect(filas[0].transfer_id).toBeTruthy()
    expect(filas[0].transfer_id).toBe(filas[1].transfer_id)
    expect(filas[0].category_id).toBeNull()
  })

  it('sin la migración 038 se guardan como ajustes, sin transfer_id', async () => {
    conPagos = false
    const { usePagarTarjeta } = await import('./usePagarTarjeta')
    const { result } = await montar(() => usePagarTarjeta())
    await act(async () => {
      await result.current.pagar({ card: { id: 'mp', name: 'MP' }, amount: 100, from: null, date: '2026-10-01' })
    })
    const filas = doble.llamadas.find((l) => l.tabla === 'transactions')?.payload as Array<Record<string, unknown>>
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ account_id: 'mp', amount: -100, type: 'adjustment' })
    expect('transfer_id' in filas[0]).toBe(false)
  })

  it('no acepta montos en cero ni fechas futuras', async () => {
    const { usePagarTarjeta } = await import('./usePagarTarjeta')
    const { result } = await montar(() => usePagarTarjeta())
    await expect(result.current.pagar({ card: { id: 'mp', name: 'MP' }, amount: 0, from: null, date: '2026-10-01' })).rejects.toThrow()
    await expect(result.current.pagar({ card: { id: 'mp', name: 'MP' }, amount: 10, from: null, date: '2999-01-01' })).rejects.toThrow()
  })
})

describe('préstamos pagados con tarjeta', () => {
  it('abonar lo que debes con una tarjeta SUBE su deuda', async () => {
    const { useLoans } = await import('./useLoans')
    const { result } = await montar(() => useLoans(), {
      accounts: [{ id: 'nu', type: 'credit' }],
      loans: [{ id: 'l1', user_id: 'u-1', name: 'Toño', amount: 1000, direction: 'i_owe', paid_at: null, created_at: '2026-10-01T00:00:00Z', notes: null }],
      loan_payments: [],
    })
    await act(async () => {
      await result.current.addPayment('l1', 300, { accountId: 'nu' })
    })
    const mov = doble.llamadas.find((l) => l.tabla === 'transactions' && l.op === 'insert')
    expect((mov?.payload as { amount: number }).amount).toBe(300)
  })

  it('si no se puede leer la cuenta, no adivina el signo ni deja el abono a medias', async () => {
    const { useLoans } = await import('./useLoans')
    const { result } = await montar(
      () => useLoans(),
      {
        loans: [{ id: 'l1', user_id: 'u-1', name: 'Toño', amount: 1000, direction: 'i_owe', paid_at: null, created_at: '2026-10-01T00:00:00Z', notes: null }],
        loan_payments: [],
      },
      { accounts: { message: 'fallo de red' } },
    )
    await act(async () => {
      await expect(result.current.addPayment('l1', 300, { accountId: 'nu' })).rejects.toThrow(/conexión/)
    })
    expect(doble.llamadas.some((l) => l.op === 'insert')).toBe(false)
  })
})

describe('sondas de esquema', () => {
  it('un fallo de red no se toma como «falta la migración»', async () => {
    const real = await vi.importActual<typeof import('@/lib/esquema')>('@/lib/esquema')
    real.olvidarEsquema()
    doble = crearSupabaseDoble({ errores: { transactions: { message: 'Failed to fetch' } } })
    await expect(real.tieneEsquemaPagos()).rejects.toThrow(/conexión/)
    doble = crearSupabaseDoble({ errores: { transactions: { message: 'column does not exist', code: '42703' } } })
    real.olvidarEsquema()
    await expect(real.tieneEsquemaPagos()).resolves.toBe(false)
  })
})
