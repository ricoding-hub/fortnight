// @vitest-environment jsdom
/**
 * La pantalla de detalle de una conexión, montada de verdad.
 *
 * Cubre lo que se rehízo a partir del reporte «no se identifica rápido, hay
 * cosas repetidas, y no hay buscador»: que el saldo se diga UNA vez, que no
 * reaparezcan los bloques espejo, y que el buscador y los chips filtren.
 */
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

afterEach(cleanup)

/* ── Una conexión 1:1: yo (Richy) y Alesita ────────────────────────────────── */

const GRUPO = { id: 'g-1', user_id: 'u-1', name: 'Alesita', emoji: null, image_url: null, invite_code: 'abc', created_at: '2026-01-01T00:00:00Z', archived_at: null }
const MIEMBROS = [
  { id: 'm-yo', group_id: 'g-1', user_id: 'u-1', name: 'Richy', is_me: true, member_user_id: 'u-1', left_at: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'm-ale', group_id: 'g-1', user_id: 'u-1', name: 'Alesita', is_me: false, member_user_id: 'u-2', left_at: null, created_at: '2026-01-01T00:00:00Z' },
]
const PERFILES = [
  { id: 'u-1', display_name: 'Richy', avatar_url: null, email: 'r@x.mx', created_at: '' },
  { id: 'u-2', display_name: 'Alesita', avatar_url: null, email: 'a@x.mx', created_at: '' },
]

const gasto = (id: string, desc: string, total: number, pagador: string, fecha: string, creado: string, user: string) => ({
  id, group_id: 'g-1', user_id: user, description: desc, amount: total, paid_by_member_id: pagador,
  split_method: 'equal', account_id: null, category_id: null, expense_date: fecha, created_at: creado,
})
const mitad = (id: string, total: number) => [
  { id: `${id}-a`, expense_id: id, member_id: 'm-yo', user_id: 'u-1', amount: total / 2, weight: null, group_id: 'g-1', created_at: '' },
  { id: `${id}-b`, expense_id: id, member_id: 'm-ale', user_id: 'u-1', amount: total / 2, weight: null, group_id: 'g-1', created_at: '' },
]

// Pagué 540 (me deben 270) y ella pagó 170 (debo 85) → me debe 185.
const GASTOS = [
  gasto('e1', 'Wings Army', 540, 'm-yo', '2026-09-23', '2026-09-23T18:00:00Z', 'u-1'),
  // Gastado el 29 de septiembre, REGISTRADO el 4 de octubre, por ella.
  gasto('e2', 'Cambio de la gas', 170, 'm-ale', '2026-09-29', '2026-10-04T15:00:00Z', 'u-2'),
]

const TABLAS: Filas = {
  split_groups: [GRUPO],
  split_members: MIEMBROS,
  split_expenses: GASTOS,
  split_expense_shares: [...mitad('e1', 540), ...mitad('e2', 170)],
  split_settlements: [],
  split_activity: [],
  split_invites: [],
  profiles: PERFILES,
  loans: [],
  loan_payments: [],
  categories: [],
}

async function montar(tablas: Filas = TABLAS, opciones: Parameters<typeof crearSupabaseDoble>[0] = {}) {
  doble = crearSupabaseDoble({ tablas, ...opciones })
  const { PrestamoGrupo } = await import('@/views/Cuentas/PrestamoGrupo')
  const { AuthProvider } = await import('@/hooks/useAuth')
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/cuentas/prestamos/g-1']}>
        <Routes>
          <Route path="/cuentas/prestamos/:groupId" element={<PrestamoGrupo />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
  await esperarA(/Wings Army|No encontrado/)
  await asentar(6)
}

const veces = (texto: string) => (document.body.textContent ?? '').split(texto).length - 1

describe('detalle de una conexión 1:1', () => {
  it('dice el saldo UNA vez y en grande', { timeout: 20_000 }, async () => {
    await montar()
    expect(screen.getByText('Alesita te debe')).toBeTruthy()
    // Antes el mismo número salía cinco veces en la primera pantalla.
    expect(veces('$185.00')).toBe(1)
  })

  it('no reaparecen los bloques espejo', { timeout: 20_000 }, async () => {
    await montar()
    const texto = document.body.textContent ?? ''
    expect(texto).not.toContain('Para saldar')
    expect(texto).not.toMatch(/Balances/)
    expect(texto).not.toContain('Liquidar')
  })

  it('conserva las dos formas de saldar', { timeout: 20_000 }, async () => {
    await montar()
    expect(screen.getByRole('button', { name: /Saldar todo/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Abonar otro monto/ })).toBeTruthy()
  })

  it('el total gastado queda como dato pequeño, no como titular', { timeout: 20_000 }, async () => {
    await montar()
    expect(screen.getByText(/Gastado entre ustedes/)).toBeTruthy()
    expect(veces('$710.00')).toBe(1) // 540 + 170
  })

  it('cada gasto dice lo tuyo, y el total en pequeño', { timeout: 20_000 }, async () => {
    await montar()
    expect(veces('+$270.00')).toBe(1)   // Wings: te deben
    expect(veces('−$85.00')).toBe(1)    // Cambio de la gas: debes
    expect(veces('de $540.00')).toBe(1)
  })

  it('avisa cuándo se registró un gasto de otro día', { timeout: 20_000 }, async () => {
    await montar()
    expect(document.body.textContent).toMatch(/Registrado 4 oct/)
    // Y no lo dice del que se registró el mismo día.
    expect((document.body.textContent ?? '').match(/Registrado \d/g)?.length).toBe(1)
  })

  it('se ve quién agregó el gasto, y sólo cuando no fuiste tú', { timeout: 20_000 }, async () => {
    await montar()
    // Con su cara y el primer nombre; el texto completo queda para lectores de pantalla.
    expect(veces('Agregado por Alesita')).toBe(1)
    expect(document.body.textContent).not.toContain('Agregado por Richy')
  })
})

describe('buscador y filtros', () => {
  const buscar = async (texto: string) => {
    const campo = screen.getByLabelText('Buscar movimientos')
    await act(async () => {
      fireEvent.change(campo, { target: { value: texto } })
    })
    await asentar(4)
  }

  it('filtra por descripción y resume lo que se ve', { timeout: 20_000 }, async () => {
    await montar()
    await buscar('wings')
    expect(screen.queryByText('Cambio de la gas')).toBeNull()
    expect(screen.getByText('Wings Army')).toBeTruthy()
    expect(document.body.textContent).toMatch(/1 movimiento · te deben \$270\.00/)
  })

  it('encuentra por monto, con o sin símbolos', { timeout: 20_000 }, async () => {
    await montar()
    await buscar('$170')
    expect(screen.getByText('Cambio de la gas')).toBeTruthy()
    expect(screen.queryByText('Wings Army')).toBeNull()
  })

  it('encuentra por quién lo agregó', { timeout: 20_000 }, async () => {
    await montar()
    await buscar('alesita')
    expect(screen.getByText('Cambio de la gas')).toBeTruthy()
  })

  it('sin resultados: lo dice y ofrece limpiar', { timeout: 20_000 }, async () => {
    await montar()
    await buscar('zzzz')
    expect(screen.getByText('Nada coincide')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    })
    await asentar(4)
    expect(screen.getByText('Wings Army')).toBeTruthy()
  })

  it('el chip «Debes» deja sólo lo que debes, y resume lo pendiente', { timeout: 20_000 }, async () => {
    await montar()
    const grupo = screen.getByRole('group', { name: 'Filtrar movimientos' })
    await act(async () => {
      fireEvent.click(within(grupo).getByRole('button', { name: /Debes/ }))
    })
    await asentar(4)
    expect(screen.getByText('Cambio de la gas')).toBeTruthy()
    expect(screen.queryByText('Wings Army')).toBeNull()
    expect(document.body.textContent).toMatch(/debes \$85\.00/)
  })
})


describe('agregar un gasto compartido', () => {
  /** Abre «+ Gasto», llena lo mínimo y guarda. */
  async function registrar(descripcion: string, monto: string) {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Gasto' }))
    })
    await asentar(6)
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: descripcion } })
      fireEvent.change(screen.getByLabelText('Monto total'), { target: { value: monto } })
    })
    await asentar(2)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Registrar gasto' }))
    })
    await asentar(4)
  }

  it('la fecha del gasto es un campo, y por omisión es hoy en horario LOCAL', { timeout: 20_000 }, async () => {
    await montar()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Gasto' }))
    })
    await asentar(6)
    const campo = screen.getByLabelText('Fecha del gasto') as HTMLInputElement
    const d = new Date()
    const hoyLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(campo.type).toBe('date')
    expect(campo.value).toBe(hoyLocal)
    expect(campo.max).toBe(hoyLocal)
  })

  it('el gasto aparece AL INSTANTE, sin esperar al servidor', { timeout: 20_000 }, async () => {
    let soltar!: () => void
    const retraso = new Promise<void>((r) => { soltar = r })
    await montar(TABLAS, { retrasoEscritura: retraso })

    await registrar('Tacos de canasta', '120')

    // El servidor todavía no contestó (la escritura sigue pendiente), y la fila ya está.
    expect(screen.getByText('Tacos de canasta')).toBeTruthy()
    // Y con lo tuyo: pagaste tú, se parte a la mitad.
    expect(document.body.textContent).toMatch(/\+\$60\.00/)

    soltar()
    await asentar(4)
  })

  it('la fecha elegida viaja al servidor tal cual', { timeout: 20_000 }, async () => {
    await montar()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Gasto' }))
    })
    await asentar(6)
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Cena del sábado' } })
      fireEvent.change(screen.getByLabelText('Monto total'), { target: { value: '300' } })
      fireEvent.change(screen.getByLabelText('Fecha del gasto'), { target: { value: '2026-09-26' } })
    })
    await asentar(2)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Registrar gasto' }))
    })
    await asentar(4)

    const escrito = doble.llamadas.find((l) => l.tabla === 'split_expenses' && l.op === 'insert')
    expect(escrito).toBeTruthy()
    expect((escrito!.payload as { expense_date: string }).expense_date).toBe('2026-09-26')
  })

  it('si el servidor lo rechaza, la fila se retira y no queda un gasto fantasma', { timeout: 20_000 }, async () => {
    await montar(TABLAS, { erroresAlEscribir: { split_expenses: { message: 'boom', code: '500' } } })
    await registrar('Gasto que falla', '999')

    expect(screen.queryByText('Gasto que falla')).toBeNull()
    // Y el saldo de arriba sigue siendo el real.
    expect(veces('$185.00')).toBe(1)
  })
})
