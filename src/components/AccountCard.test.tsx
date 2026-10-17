// @vitest-environment jsdom
/**
 * Actualizar el saldo de una tarjeta a mano, como lo hace casi todo mundo.
 *
 * Bajarlo pregunta si fue un pago; subirlo, si son compras de antes del corte:
 * fechado hoy, el aumento se tomaba como compra nueva y el pago para no generar
 * intereses salía de menos.
 */
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AccountCard } from './AccountCard'
import { estadosDeCuenta } from '@/lib/estadoDeCuenta'
import type { Account } from '@/types'

afterEach(cleanup)

const MP = {
  id: 'mp', user_id: 'u-1', name: 'MercadoPago', type: 'credit', balance: 7000, credit_limit: 20000,
  cut_day: 15, payment_due_day: 5, payment_grace_days: null, min_payment_pct: null, sort_order: 1,
  source: 'manual', color: null, logo_domain: null, created_at: '2026-01-10T18:00:00Z', updated_at: '',
} as unknown as Account
const estado = estadosDeCuenta({ tarjetas: [MP], movs: [], planes: [], correcciones: [], hoy: '2026-10-20' }).mp

function montar() {
  const onSaveBalance = vi.fn(async () => {})
  const onPagar = vi.fn()
  render(
    <MemoryRouter>
      <AccountCard account={MP} estado={estado} onSaveBalance={onSaveBalance} onEditDetails={() => {}} onPagar={onPagar} />
    </MemoryRouter>,
  )
  return { onSaveBalance, onPagar }
}

async function editar(valor: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Editar saldo' }))
  })
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Nuevo saldo'), { target: { value: valor } })
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar saldo' }))
  })
}

describe('saldo de una tarjeta a mano', () => {
  it('subirlo pregunta si son compras de antes del corte, y las fecha en el corte', async () => {
    const { onSaveBalance } = montar()
    await editar('9000')
    expect(screen.getByText(/Subiste la deuda \$2,000\.00\. ¿Son compras de antes del corte del 15 oct\?/)).toBeTruthy()
    expect(onSaveBalance).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sí, van en ese estado de cuenta' }))
    })
    expect(onSaveBalance).toHaveBeenCalledWith(MP, 9000, '2026-10-15')
  })

  it('«son recientes» lo guarda con la fecha de hoy', async () => {
    const { onSaveBalance } = montar()
    await editar('9000')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'No, son recientes' }))
    })
    expect(onSaveBalance).toHaveBeenCalledWith(MP, 9000, undefined)
  })

  it('bajarlo pregunta si fue un pago y abre el pago con la diferencia', async () => {
    const { onSaveBalance, onPagar } = montar()
    await editar('5000')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sí, registrar el pago' }))
    })
    expect(onPagar).toHaveBeenCalledWith(2000)
    expect(onSaveBalance).not.toHaveBeenCalled()
  })
})
