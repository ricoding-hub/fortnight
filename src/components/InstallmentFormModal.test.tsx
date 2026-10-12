// @vitest-environment jsdom
/**
 * Editar un plan a meses, tras sacar sus campos a `InstallmentFields`.
 *
 * El archivo pasó de 394 líneas a un envoltorio de 48: la prueba es lo que dice
 * que no se perdió nada por el camino.
 */
import '@/test/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { crearSupabaseDoble } from '@/test/supabaseDoble'
import { asentar, esperarA } from '@/test/espera'
import { vivo, type InstallmentVivo } from '@/lib/msi'
import type { Installment } from '@/types'

let doble = crearSupabaseDoble()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return doble.cliente
  },
}))

// Sólo el reloj: las esperas siguen siendo reales.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 12, 12))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const CRUDO: Installment = {
  id: 'i-1', user_id: 'u-1', account_id: 'a-2', name: 'Laptop', total_amount: 9000, monthly_amount: 750,
  months_total: 12, months_paid: 3, start_date: '2026-06-29', status: 'active', is_zero_interest: true,
  created_at: '2026-06-29T18:00:00Z', updated_at: '',
} as Installment
// Sin día de corte en la tarjeta: vence cada mes desde la compra.
const PLAN: InstallmentVivo = vivo(CRUDO, null, '2026-10-12', {
  id: 't-1', amount: 9000, account_id: 'a-2', date: '2026-06-29',
})

const TARJETA = {
  id: 'a-2', user_id: 'u-1', name: 'Nu', type: 'credit', balance: 4000, credit_limit: 20000, sort_order: 0,
  created_at: '', updated_at: '', source: 'manual',
}

async function abrir(plan?: InstallmentVivo) {
  doble = crearSupabaseDoble({ tablas: { accounts: [TARJETA], installments: [] } })
  const onSubmit = vi.fn(async () => {})
  const onUpdate = vi.fn(async () => {})
  const onClose = vi.fn()
  const { InstallmentFormModal } = await import('@/components/InstallmentFormModal')
  const { AuthProvider } = await import('@/hooks/useAuth')
  render(
    <AuthProvider>
      <InstallmentFormModal open onClose={onClose} onSubmit={onSubmit} onUpdate={onUpdate} editingInstallment={plan} />
    </AuthProvider>,
  )
  await esperarA(/Laptop|compra a meses|plan a meses/i)
  await asentar(8)
  return { onSubmit, onUpdate, onClose }
}

describe('editar un plan a meses', () => {
  it('abre con los valores del plan y dice en qué mensualidad va', { timeout: 20_000 }, async () => {
    await abrir(PLAN)
    expect((screen.getByLabelText('¿Qué compraste?') as HTMLInputElement).value).toBe('Laptop')
    expect((screen.getByLabelText('Monto total') as HTMLInputElement).value).toBe('9000')
    expect((screen.getByLabelText('Meses') as HTMLSelectElement).value).toBe('12')
    expect((screen.getByLabelText('Fecha de compra') as HTMLInputElement).value).toBe('2026-06-29')
    // Ya no se capturan «pagos ya hechos»: salen de las fechas.
    expect(screen.queryByLabelText('Pagos ya hechos')).toBeNull()
    expect(screen.getByText(/Vas en la mensualidad 4 de 12 · 3 ya pagadas/)).toBeTruthy()
  })

  it('al editar no pregunta si ya está en el saldo', { timeout: 20_000 }, async () => {
    // Cambiarlo después es el caso ambiguo; sólo se ofrece al crear.
    await abrir(PLAN)
    expect(screen.queryByText('¿Ya está en el saldo de la tarjeta?')).toBeNull()
  })

  it('avisa qué le pasa al cargo de la tarjeta antes de guardar', { timeout: 20_000 }, async () => {
    const { onUpdate } = await abrir(PLAN)
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Monto total'), { target: { value: '9600' } })
    })
    await asentar(2)
    expect(screen.getByText(/El cargo en Nu pasa de \$9,000.00 a \$9,600.00/)).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    })
    await asentar(6)
    expect(onUpdate).toHaveBeenCalledWith('i-1', expect.objectContaining({ total_amount: 9600, start_date: '2026-06-29' }))
  })

  it('un plazo que no está en la lista (10 meses) no se pierde', { timeout: 20_000 }, async () => {
    await abrir(vivo({ ...CRUDO, months_total: 10, monthly_amount: 900 }, null, '2026-10-12'))
    expect((screen.getByLabelText('Meses') as HTMLSelectElement).value).toBe('10')
  })

  it('una fecha de compra en el futuro no se acepta', { timeout: 20_000 }, async () => {
    const { onUpdate } = await abrir(PLAN)
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Fecha de compra'), { target: { value: '2026-12-01' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    })
    await asentar(4)
    expect(screen.getByText('La compra no puede ser en el futuro')).toBeTruthy()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('crear uno nuevo trae el título y los valores por omisión', { timeout: 20_000 }, async () => {
    await abrir()
    expect(screen.getByText('Nueva compra a meses')).toBeTruthy()
    expect((screen.getByLabelText('Meses') as HTMLSelectElement).value).toBe('12')
    expect((screen.getByLabelText('Fecha de compra') as HTMLInputElement).value).toBe('2026-10-12')
  })
})
