// @vitest-environment jsdom
/**
 * «A los nuevos usuarios sólo los deja agregar tarjetas de débito» y «no deja
 * ver primero las de crédito». La pantalla de Cuentas, montada de verdad.
 */
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { crearSupabaseDoble, type Filas } from '@/test/supabaseDoble'
import { asentar } from '@/test/espera'

let doble = crearSupabaseDoble()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return doble.cliente
  },
}))

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const cuenta = (id: string, name: string, type: 'debit' | 'credit', sort: number | string) => ({
  id, user_id: 'u-1', name, type, balance: 1000, credit_limit: type === 'credit' ? 20000 : null,
  cut_day: type === 'credit' ? 15 : null, payment_due_day: type === 'credit' ? 5 : null,
  payment_grace_days: null, color: null, logo_domain: null, sort_order: sort, source: 'manual',
  created_at: `2026-01-0${String(sort).slice(-1)}T00:00:00Z`, updated_at: '2026-01-01T00:00:00Z',
})

async function montar(tablas: Filas = {}) {
  doble = crearSupabaseDoble({ tablas: { accounts: [], installments: [], user_config: [], synced_credentials: [], ...tablas } })
  const { MisCuentas } = await import('@/views/Cuentas/MisCuentas')
  const { AuthProvider } = await import('@/hooks/useAuth')
  render(
    <AuthProvider>
      <MemoryRouter>
        <MisCuentas />
      </MemoryRouter>
    </AuthProvider>,
  )
  await asentar(8)
}

const titulos = () =>
  screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

describe('Cuentas para un usuario nuevo', () => {
  it('muestra débito, crédito y MSI desde el primer día', { timeout: 20_000 }, async () => {
    await montar()
    expect(titulos()).toEqual(['Débito', 'Crédito', 'Meses sin intereses'])
    expect(screen.getByRole('button', { name: /Agregar tarjeta de crédito/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Agregar cuenta de débito/ })).toBeTruthy()
  })

  it('puede crear una tarjeta de crédito, con límite con comas', { timeout: 20_000 }, async () => {
    await montar()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Agregar tarjeta de crédito/ }))
    })
    await asentar(2)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Agregar manual/ }))
    })
    await asentar(2)
    expect(screen.getByText('Nueva tarjeta de crédito')).toBeTruthy()

    const escribir = (label: RegExp, valor: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value: valor } })
    await act(async () => {
      escribir(/^Nombre/, 'Nu')
      escribir(/Límite de crédito/, '50,000')
      escribir(/Día de corte/, '15')
      // Escribe un día inválido y luego cambia a días de gracia: el campo que
      // queda oculto ya no puede bloquear el botón.
      escribir(/Día del mes/, '60')
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Días de gracia' }))
    })
    await act(async () => {
      escribir(/Días desde el corte/, '20')
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    })
    await asentar(4)

    const alta = doble.llamadas.find((l) => l.tabla === 'accounts' && l.op === 'insert')
    expect(alta?.payload).toMatchObject({
      name: 'Nu',
      type: 'credit',
      credit_limit: 50000,
      cut_day: 15,
      payment_due_day: null,
      payment_grace_days: 20,
    })
  })

  it('desde la sección de débito también se puede cambiar a crédito', { timeout: 20_000 }, async () => {
    await montar()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta de débito/ }))
    })
    await asentar(2)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Agregar manual/ }))
    })
    await asentar(2)
    expect(screen.getByText('Nueva cuenta de débito')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Crédito' }))
    })
    expect(screen.getByText('Nueva tarjeta de crédito')).toBeTruthy()
    expect(screen.getByLabelText(/Límite de crédito/)).toBeTruthy()
  })
})

describe('orden de las secciones', () => {
  const CUENTAS = [cuenta('d1', 'BBVA', 'debit', 1), cuenta('c1', 'Nu', 'credit', 2)]

  it('«Mostrar primero: Crédito» pone crédito arriba y lo guarda', { timeout: 20_000 }, async () => {
    await montar({ accounts: CUENTAS })
    expect(titulos().slice(0, 2)).toEqual(['Débito', 'Crédito'])
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Reordenar/ }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Crédito' }))
    })
    await asentar(2)
    expect(titulos().slice(0, 2)).toEqual(['Crédito', 'Débito'])
    const guardado = doble.llamadas.find((l) => l.tabla === 'user_config' && l.op === 'upsert')
    expect(guardado?.payload).toMatchObject({ accounts_first: 'credit' })
  })

  it('sin la migración 035, la preferencia queda en este navegador', { timeout: 20_000 }, async () => {
    // Simula la columna ausente: cualquier escritura a user_config falla así.
    doble = crearSupabaseDoble({
      tablas: { accounts: CUENTAS, installments: [], user_config: [] },
      erroresAlEscribir: { user_config: { message: 'column not found', code: 'PGRST204' } },
    })
    const { MisCuentas } = await import('@/views/Cuentas/MisCuentas')
    const { AuthProvider } = await import('@/hooks/useAuth')
    render(
      <AuthProvider>
        <MemoryRouter>
          <MisCuentas />
        </MemoryRouter>
      </AuthProvider>,
    )
    await asentar(8)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Reordenar/ }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Crédito' }))
    })
    await asentar(2)
    expect(titulos().slice(0, 2)).toEqual(['Crédito', 'Débito'])
    expect(localStorage.getItem('fortnight:cuentas:primero')).toBe('credit')
  })

  it('subir una tarjeta la mueve al instante, sin esperar al servidor', { timeout: 20_000 }, async () => {
    let soltar: () => void = () => {}
    const retraso = new Promise<void>((r) => {
      soltar = r
    })
    const tablas = {
      accounts: [cuenta('d1', 'BBVA', 'debit', '1'), cuenta('d2', 'Santander', 'debit', '2')],
      installments: [],
      user_config: [],
    }
    doble = crearSupabaseDoble({ tablas, retrasoEscritura: retraso })
    const { MisCuentas } = await import('@/views/Cuentas/MisCuentas')
    const { AuthProvider } = await import('@/hooks/useAuth')
    render(
      <AuthProvider>
        <MemoryRouter>
          <MisCuentas />
        </MemoryRouter>
      </AuthProvider>,
    )
    await asentar(8)
    const nombres = () =>
      Array.from(document.querySelectorAll('#tour-cuentas-debito li')).map((li) =>
        li.textContent?.includes('Santander') ? 'Santander' : 'BBVA',
      )
    expect(nombres()).toEqual(['BBVA', 'Santander'])
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Reordenar/ }))
    })
    const subir = screen.getAllByRole('button', { name: /Mover hacia arriba/ })
    await act(async () => {
      fireEvent.click(subir[subir.length - 1])
    })
    // El servidor aún no contesta y la tarjeta ya cambió de lugar.
    expect(nombres()).toEqual(['Santander', 'BBVA'])
    soltar()
    await asentar(2)
  })
})
