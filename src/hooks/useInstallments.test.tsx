// @vitest-environment jsdom
/**
 * Los planes a meses con fechas: qué se escribe al crear, marcar, editar y
 * borrar. Con y sin la migración 036.
 */
import '@/test/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
let migrado = true
vi.mock('@/lib/esquema', () => ({
  tieneEsquemaMsi: () => Promise.resolve(migrado),
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 20, 12))
  migrado = true
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const CICLO = { type: 'credit', cut_day: 15, payment_due_day: 5, payment_grace_days: null }
const PLAN = {
  id: 'p1', user_id: 'u-1', account_id: 'c1', name: 'iPhone', total_amount: 12000, monthly_amount: 1000,
  months_total: 12, months_paid: 0, start_date: '2026-07-03', status: 'active', is_zero_interest: true,
  created_at: '2026-07-03T18:00:00Z', updated_at: '', month_status: { _v: 2 }, billing_offset: 0,
  cuenta: CICLO,
  vinculados: [{ id: 't1', amount: 12000, account_id: 'c1', date: '2026-07-03', type: 'installment' }],
}

async function montar(tablas: Filas = { installments: [PLAN], accounts: [{ id: 'c1', ...CICLO }] }) {
  doble = crearSupabaseDoble({ tablas })
  const { useInstallments } = await import('./useInstallments')
  const { AuthProvider } = await import('./useAuth')
  const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>
  const r = renderHook(() => useInstallments(), { wrapper })
  await asentar(8)
  return r
}

const escrituras = (tabla: string, op?: string) =>
  doble.llamadas.filter((l) => l.tabla === tabla && (!op || l.op === op))

describe('useInstallments', () => {
  it('avanza solo: tres meses después de la compra va en la mensualidad 4', { timeout: 20_000 }, async () => {
    const { result } = await montar()
    const p = result.current.data[0]
    expect(p.months_paid).toBe(3)
    expect(p.msi.actual).toMatchObject({ n: 4, estado: 'por-pagar', vence: '2026-11-05' })
    expect(p.cargo?.amount).toBe(12000)
  })

  it('crear carga a la tarjeta lo que falta, no lo que ya venció', { timeout: 20_000 }, async () => {
    const { result } = await montar({ installments: [], accounts: [{ id: 'c1', ...CICLO }] })
    await act(async () => {
      await result.current.create({
        name: 'Tele', total_amount: 6000, monthly_amount: 1000, months_total: 6,
        account_id: 'c1', start_date: '2026-07-03', charge_to_card: true,
      })
    })
    const cargo = escrituras('transactions', 'insert')[0]?.payload as { amount: number; type: string }
    // Vencieron el 5 ago, 5 sep y 5 oct (pagadas con esos estados de cuenta): quedan 3,000.
    expect(cargo).toMatchObject({ amount: 3000, type: 'installment' })
    expect(escrituras('installments', 'insert')[0]?.payload).toMatchObject({ months_paid: 3, month_status: { _v: 2 } })
  })

  it('marcar una mensualidad guarda la marca y la copia del contador', { timeout: 20_000 }, async () => {
    const { result } = await montar()
    await act(async () => {
      await result.current.marcarMes('p1', 4, 'paid')
    })
    const upd = escrituras('installments', 'update')[0]?.payload as Record<string, unknown>
    expect(upd.month_status).toMatchObject({ '4': { s: 'paid', at: '2026-10-20' } })
    expect(upd.months_paid).toBe(4)
    // Marcar no mueve el saldo.
    expect(escrituras('transactions')).toHaveLength(0)
  })

  it('cambiar el total edita el cargo por la diferencia, en una sola escritura', { timeout: 20_000 }, async () => {
    const { result } = await montar()
    await act(async () => {
      await result.current.update('p1', { total_amount: 12600, monthly_amount: 1050 })
    })
    expect(escrituras('transactions', 'update')[0]?.payload).toMatchObject({ amount: 12600, account_id: 'c1' })
    expect(escrituras('transactions', 'delete')).toHaveLength(0)
  })

  it('sin la migración 036, el cargo se borra y se vuelve a crear', { timeout: 20_000 }, async () => {
    migrado = false
    const { result } = await montar()
    await act(async () => {
      await result.current.update('p1', { total_amount: 12600, monthly_amount: 1050 })
    })
    expect(escrituras('transactions', 'update')).toHaveLength(0)
    expect(escrituras('transactions', 'delete')).toHaveLength(1)
    expect(escrituras('transactions', 'insert')[0]?.payload).toMatchObject({ amount: 12600, installment_id: 'p1' })
  })

  it('cambiar sólo el plazo no toca el cargo', { timeout: 20_000 }, async () => {
    const { result } = await montar()
    await act(async () => {
      await result.current.update('p1', { months_total: 18, monthly_amount: 666.67 })
    })
    expect(escrituras('transactions')).toHaveLength(0)
  })

  it('borrar con pagos hechos deja el cargo; si se pide, lo quita', { timeout: 20_000 }, async () => {
    const { result } = await montar()
    await act(async () => {
      await result.current.remove('p1', { quitarCargo: false })
    })
    expect(escrituras('transactions', 'delete')).toHaveLength(0)
    expect(escrituras('installments', 'delete')).toHaveLength(1)

    const otro = await montar()
    await act(async () => {
      await otro.result.current.remove('p1', { quitarCargo: true })
    })
    expect(escrituras('transactions', 'delete')).toHaveLength(1)
  })
})

describe('un gasto convertido a meses', () => {
  // El gasto existía desde la compra (jul); el plan se creó al convertirlo (oct).
  const CONVERTIDO = {
    ...PLAN,
    created_at: '2026-10-17T18:00:00Z',
    vinculados: [{ id: 't1', amount: 12000, account_id: 'c1', date: '2026-07-03', type: 'installment', created_at: '2026-07-03T20:00:00Z' }],
  }
  const tablas = (): Filas => ({ installments: [CONVERTIDO], accounts: [{ id: 'c1', ...CICLO }] })

  it('se reconoce como adoptado', { timeout: 20_000 }, async () => {
    const { result } = await montar(tablas())
    expect(result.current.data[0].cargo).toMatchObject({ amount: 12000, adoptado: true })
  })

  it('cambiar el plazo no encoge la compra', { timeout: 20_000 }, async () => {
    const { result } = await montar(tablas())
    await act(async () => {
      await result.current.update('p1', { months_total: 6, monthly_amount: 2000 })
    })
    expect(escrituras('transactions')).toHaveLength(0)
  })

  it('cambiar el total mueve el cargo sólo por la diferencia', { timeout: 20_000 }, async () => {
    const { result } = await montar(tablas())
    await act(async () => {
      await result.current.update('p1', { total_amount: 12500, monthly_amount: 1041.67 })
    })
    expect(escrituras('transactions', 'update')[0]?.payload).toMatchObject({ amount: 12500 })
  })

  it('borrar el plan devuelve el gasto a Movimientos, no lo borra', { timeout: 20_000 }, async () => {
    const { result } = await montar(tablas())
    await act(async () => {
      await result.current.remove('p1', { quitarCargo: true })
    })
    expect(escrituras('transactions', 'delete')).toHaveLength(0)
    expect(escrituras('transactions', 'update')[0]?.payload).toEqual({ type: 'transaction', installment_id: null })
    expect(escrituras('installments', 'delete')).toHaveLength(1)
  })

  it('convertir no carga nada nuevo: el gasto pasa a ser el cargo del plan', { timeout: 20_000 }, async () => {
    const { result } = await montar({ installments: [], accounts: [{ id: 'c1', ...CICLO }], transactions: [{ id: 'tx-x' }] })
    await act(async () => {
      await result.current.create({
        name: 'iPhone', total_amount: 12000, monthly_amount: 1000, months_total: 12,
        account_id: 'c1', start_date: '2026-07-03', charge_to_card: false, adopt_tx_id: 'tx-x',
      })
    })
    expect(escrituras('transactions', 'insert')).toHaveLength(0)
    expect(escrituras('transactions', 'update')[0]?.payload).toMatchObject({ type: 'installment' })
  })

  it('si el gasto ya no se puede convertir, el plan se deshace', { timeout: 20_000 }, async () => {
    const { result } = await montar({ installments: [], accounts: [{ id: 'c1', ...CICLO }], transactions: [] })
    await act(async () => {
      await expect(
        result.current.create({
          name: 'iPhone', total_amount: 12000, monthly_amount: 1000, months_total: 12,
          account_id: 'c1', start_date: '2026-07-03', charge_to_card: false, adopt_tx_id: 'tx-borrado',
        }),
      ).rejects.toThrow(/ya no se puede convertir/)
    })
    expect(escrituras('installments', 'delete')).toHaveLength(1)
  })
})
