// @vitest-environment jsdom
/**
 * La hoja «Agregar», montada de verdad.
 *
 * Lo que se verifica es lo que el formulario MANDA, no cómo se ve: el signo de
 * un gasto en tarjeta, la fecha, el grupo en el que se estampa un préstamo, el
 * `charge_to_card` de una compra a meses. Un formulario puede verse perfecto y
 * escribir el dato contrario.
 */
import '@/test/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { crearSupabaseDoble, type Filas } from '@/test/supabaseDoble'
import { asentar, esperarA } from '@/test/espera'
import type { Account, Category } from '@/types'

let doble = crearSupabaseDoble()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return doble.cliente
  },
}))

const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const cuenta = (over: Partial<Account>): Account =>
  ({
    id: 'a-1', user_id: 'u-1', name: 'BBVA', type: 'debit', balance: 7000, credit_limit: null, cut_day: null,
    payment_due_day: null, payment_grace_days: null, color: null, logo_domain: null, cost_type: null, apr: null,
    min_payment_pct: null, prepay_buffer: 0, sort_order: 0, created_at: '', updated_at: '', source: 'manual',
    ...over,
  }) as Account
const DEBITO = cuenta({})
const TARJETA = cuenta({ id: 'a-2', name: 'Nu', type: 'credit', balance: 4000, credit_limit: 20000, sort_order: 1 })

const cat = (id: string, name: string, kind: Category['kind']): Category =>
  ({ id, user_id: 'u-1', name, kind, icon: null, color: null, created_at: '' }) as Category
const CATEGORIAS = [cat('c-comida', 'Comida', 'variable'), cat('c-renta', 'Renta', 'fixed'), cat('c-salario', 'Salario', 'income')]

// Una conexión 1:1 SIN conectar con Alesita, para estampar préstamos.
const SPLIT: Filas = {
  split_groups: [{ id: 'g-1', user_id: 'u-1', name: 'Alesita', emoji: null, image_url: null, invite_code: 'x', created_at: '', archived_at: null }],
  split_members: [
    { id: 'm-yo', group_id: 'g-1', user_id: 'u-1', name: 'Richy', is_me: true, member_user_id: 'u-1', left_at: null, created_at: '' },
    { id: 'm-ale', group_id: 'g-1', user_id: 'u-1', name: 'Alesita', is_me: false, member_user_id: null, left_at: null, created_at: '' },
  ],
  split_expenses: [], split_expense_shares: [], split_settlements: [], split_activity: [], split_invites: [],
  profiles: [], loans: [], loan_payments: [], user_gamification: [], installments: [],
}

const onCreate = vi.fn(async () => {})
const onClose = vi.fn()

async function abrir(props: { initialKind?: 'gasto' | 'ingreso' | 'prestamo' | 'meses'; cuentas?: Account[] } = {}, tablas: Filas = SPLIT) {
  doble = crearSupabaseDoble({ tablas })
  const { AddSheet } = await import('@/components/add/AddSheet')
  const { AuthProvider } = await import('@/hooks/useAuth')
  render(
    <AuthProvider>
      <AddSheet
        open
        onClose={onClose}
        accounts={props.cuentas ?? [DEBITO, TARJETA]}
        categories={CATEGORIAS}
        onCreate={onCreate}
        initialKind={props.initialKind}
      />
    </AuthProvider>,
  )
  await esperarA(/Agregar/)
  await asentar(8)
}

const escribir = async (etiqueta: string, valor: string) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
  })
}
const elegir = async (etiqueta: string, valor: string) => escribir(etiqueta, valor)
const pulsar = async (nombre: RegExp | string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: nombre }))
  })
  await asentar(6)
}

beforeEach(() => {
  onCreate.mockClear()
  onClose.mockClear()
  window.localStorage.clear()
})
afterEach(cleanup)

describe('la hoja «Agregar»', () => {
  it('no hay numpad: son campos de verdad, y el botón está a la vista', { timeout: 20_000 }, async () => {
    await abrir()
    for (const tecla of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) {
      expect(screen.queryByRole('button', { name: tecla })).toBeNull()
    }
    expect((screen.getByLabelText('Monto') as HTMLInputElement).inputMode).toBe('decimal')
    expect((screen.getByLabelText('Fecha') as HTMLInputElement).type).toBe('date')
    expect(screen.getByLabelText('Categoría').tagName).toBe('SELECT')
    expect(screen.getByLabelText('Cuenta').tagName).toBe('SELECT')
    expect(screen.getByRole('button', { name: /Registrar gasto/ })).toBeTruthy()
  })

  it('ofrece los cuatro tipos', { timeout: 20_000 }, async () => {
    await abrir()
    const grupo = screen.getByRole('radiogroup', { name: 'Qué vas a agregar' })
    for (const t of ['Gasto', 'Ingreso', 'Préstamo', 'A meses']) {
      expect(within(grupo).getByRole('radio', { name: t })).toBeTruthy()
    }
  })

  it('sin llenar nada, dice qué falta junto a cada campo', { timeout: 20_000 }, async () => {
    await abrir()
    await pulsar(/Registrar gasto/)
    expect(screen.getByText('Escribe el monto')).toBeTruthy()
    expect(screen.getByText('Elige una categoría')).toBeTruthy()
    expect(onCreate).not.toHaveBeenCalled()
  })
})

describe('gasto e ingreso', () => {
  it('un gasto en débito RESTA, con la fecha de hoy', { timeout: 20_000 }, async () => {
    await abrir()
    await escribir('Monto', '200')
    await elegir('Categoría', 'c-comida')
    await elegir('Cuenta', 'a-1')
    await pulsar(/Registrar gasto/)

    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate).toHaveBeenCalledWith({
      account_id: 'a-1', amount: -200, category_id: 'c-comida', description: null, date: hoy(),
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('un gasto en tarjeta SUBE la deuda, y lo dice', { timeout: 20_000 }, async () => {
    await abrir()
    await elegir('Cuenta', 'a-2')
    expect(document.body.textContent).toMatch(/SUBE la deuda de Nu/)
    await escribir('Monto', '350')
    await elegir('Categoría', 'c-comida')
    await pulsar(/Registrar gasto/)
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ account_id: 'a-2', amount: 350 }))
  })

  it('un ingreso en débito SUMA; en tarjeta es un pago y BAJA la deuda', { timeout: 20_000 }, async () => {
    await abrir({ initialKind: 'ingreso' })
    await escribir('Monto', '9800')
    await elegir('Categoría', 'c-salario')
    await elegir('Cuenta', 'a-1')
    await pulsar(/Registrar ingreso/)
    expect(onCreate).toHaveBeenLastCalledWith(expect.objectContaining({ account_id: 'a-1', amount: 9800 }))

    cleanup()
    onCreate.mockClear()
    await abrir({ initialKind: 'ingreso' })
    await elegir('Cuenta', 'a-2')
    expect(document.body.textContent).toMatch(/BAJA la deuda de Nu/)
    await escribir('Monto', '1500')
    await elegir('Categoría', 'c-salario')
    await pulsar(/Registrar ingreso/)
    expect(onCreate).toHaveBeenLastCalledWith(expect.objectContaining({ account_id: 'a-2', amount: -1500 }))
  })

  it('el ingreso sólo ofrece categorías de ingreso, y el gasto no', { timeout: 20_000 }, async () => {
    await abrir({ initialKind: 'ingreso' })
    const opciones = within(screen.getByLabelText('Categoría')).getAllByRole('option').map((o) => o.textContent)
    expect(opciones).toContain('Salario')
    expect(opciones).not.toContain('Comida')
  })

  it('acepta los montos como de verdad se escriben', { timeout: 20_000 }, async () => {
    for (const [escrito, esperado] of [['1,234.50', 1234.5], ['574,5', 574.5], ['$99', 99]] as const) {
      cleanup()
      onCreate.mockClear()
      await abrir()
      await escribir('Monto', escrito)
      await elegir('Categoría', 'c-comida')
      await pulsar(/Registrar gasto/)
      expect(onCreate, escrito).toHaveBeenCalledWith(expect.objectContaining({ amount: -esperado }))
    }
  })

  it('un monto basura no se guarda', { timeout: 20_000 }, async () => {
    await abrir()
    await escribir('Monto', 'abc')
    await elegir('Categoría', 'c-comida')
    await pulsar(/Registrar gasto/)
    expect(screen.getByText(/Monto inválido/)).toBeTruthy()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('manda la nota y una fecha anterior tal cual', { timeout: 20_000 }, async () => {
    await abrir()
    await escribir('Monto', '120')
    await elegir('Categoría', 'c-comida')
    await escribir('Fecha', '2026-09-26')
    await escribir('Nota (opcional)', 'Tacos de canasta')
    await pulsar(/Registrar gasto/)
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-09-26', description: 'Tacos de canasta' }))
  })

  it('recuerda la última categoría y cuenta', { timeout: 20_000 }, async () => {
    await abrir()
    await escribir('Monto', '80')
    await elegir('Categoría', 'c-renta')
    await elegir('Cuenta', 'a-2')
    await pulsar(/Registrar gasto/)

    cleanup()
    await abrir()
    expect((screen.getByLabelText('Categoría') as HTMLSelectElement).value).toBe('c-renta')
    expect((screen.getByLabelText('Cuenta') as HTMLSelectElement).value).toBe('a-2')
  })
})

describe('préstamo', () => {
  it('se estampa en la conexión 1:1 sin conectar', { timeout: 20_000 }, async () => {
    await abrir({ initialKind: 'prestamo' })
    await escribir('¿Quién te debe?', 'Alesita')
    await escribir('Monto', '500')
    await pulsar(/Registrar préstamo/)

    const insert = doble.llamadas.find((l) => l.tabla === 'loans' && l.op === 'insert')
    expect(insert).toBeTruthy()
    expect(insert!.payload).toMatchObject({ name: 'Alesita', amount: 500, direction: 'owed_to_me', group_id: 'g-1' })
    // Hoy no se manda la fecha: así funciona aunque la migración 034 no se haya corrido.
    expect(insert!.payload).not.toHaveProperty('loan_date')
  })

  it('«Yo debo» guarda la dirección contraria', { timeout: 20_000 }, async () => {
    await abrir({ initialKind: 'prestamo' })
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Yo debo' }))
    })
    await escribir('¿A quién le debes?', 'Alesita')
    await escribir('Monto', '120.50')
    await pulsar(/Registrar préstamo/)
    const insert = doble.llamadas.find((l) => l.tabla === 'loans' && l.op === 'insert')
    expect(insert!.payload).toMatchObject({ direction: 'i_owe', amount: 120.5 })
  })

  it('con otra fecha, la manda como loan_date', { timeout: 20_000 }, async () => {
    await abrir({ initialKind: 'prestamo' })
    // Beto no está en la lista: el flujo real es «Otra persona…» y escribir el nombre.
    await elegir('¿Quién te debe?', '__otra__')
    await escribir('Nombre', 'Beto')
    await escribir('Monto', '300')
    await escribir('Fecha', '2026-09-20')
    await pulsar(/Registrar préstamo/)
    const insert = doble.llamadas.find((l) => l.tabla === 'loans' && l.op === 'insert')
    expect(insert!.payload).toMatchObject({ name: 'Beto', loan_date: '2026-09-20' })
    // Y a alguien sin conexión no se le inventa un grupo.
    expect((insert!.payload as { group_id?: string }).group_id).toBeUndefined()
  })

  it('sin nombre no guarda y lo dice', { timeout: 20_000 }, async () => {
    await abrir({ initialKind: 'prestamo' })
    await escribir('Monto', '100')
    await pulsar(/Registrar préstamo/)
    expect(screen.getByText(/Elige o escribe a quién/)).toBeTruthy()
    expect(doble.llamadas.some((l) => l.tabla === 'loans' && l.op === 'insert')).toBe(false)
  })
})

describe('compra a meses', () => {
  const llenar = async () => {
    await escribir('¿Qué compraste?', 'iPhone')
    await escribir('Monto total', '12000')
    await escribir('Meses', '12')
  }

  it('lo común está a la vista y lo avanzado, plegado', { timeout: 20_000 }, async () => {
    await abrir({ initialKind: 'meses' })
    expect(screen.getByLabelText('¿Qué compraste?')).toBeTruthy()
    expect(screen.getByLabelText('Monto total')).toBeTruthy()
    expect(screen.getByLabelText('Meses').tagName).toBe('SELECT')
    expect(screen.getByLabelText('Tarjeta').tagName).toBe('SELECT')
    expect(screen.queryByLabelText('Pagos ya hechos')).toBeNull()
    await pulsar(/Más opciones/)
    expect(screen.getByLabelText('Pagos ya hechos')).toBeTruthy()
  })

  it('calcula la mensualidad en vivo', { timeout: 20_000 }, async () => {
    await abrir({ initialKind: 'meses' })
    await llenar()
    expect(document.body.textContent).toMatch(/\$1,000\.00\/mes durante 12 meses/)
    expect(screen.getByRole('button', { name: /Registrar · \$1,000\.00\/mes/ })).toBeTruthy()
  })

  it('registra el plan y CARGA el saldo a la tarjeta por omisión', { timeout: 20_000 }, async () => {
    await abrir({ initialKind: 'meses' })
    await llenar()
    await elegir('Tarjeta', 'a-2')
    expect(document.body.textContent).toMatch(/pasa de .*\$4,000\.00.* a .*\$16,000\.00/)
    await pulsar(/Registrar · /)

    const plan = doble.llamadas.find((l) => l.tabla === 'installments' && l.op === 'insert')
    expect(plan).toBeTruthy()
    expect(plan!.payload).toMatchObject({ name: 'iPhone', total_amount: 12000, monthly_amount: 1000, months_total: 12, account_id: 'a-2' })
    // La carga a la tarjeta es una transacción de tipo 'installment'.
    expect(doble.llamadas.some((l) => l.tabla === 'transactions' && l.op === 'insert')).toBe(true)
  })

  it('«Sí, ya está» NO toca el saldo', { timeout: 20_000 }, async () => {
    await abrir({ initialKind: 'meses' })
    await llenar()
    await elegir('Tarjeta', 'a-2')
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Sí, ya está' }))
    })
    expect(document.body.textContent).toMatch(/No tocamos tu saldo/)
    await pulsar(/Registrar · /)
    expect(doble.llamadas.some((l) => l.tabla === 'installments' && l.op === 'insert')).toBe(true)
    expect(doble.llamadas.some((l) => l.tabla === 'transactions' && l.op === 'insert')).toBe(false)
  })

  it('no deja registrar sin nombre ni monto', { timeout: 20_000 }, async () => {
    await abrir({ initialKind: 'meses' })
    await pulsar(/Registrar compra a meses/)
    expect(screen.getByText('Escribe qué compraste')).toBeTruthy()
    expect(doble.llamadas.some((l) => l.tabla === 'installments' && l.op === 'insert')).toBe(false)
  })
})

describe('cambiar de tipo', () => {
  it('cada pestaña trae sus campos', { timeout: 20_000 }, async () => {
    await abrir()
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'A meses' }))
    })
    await asentar(4)
    expect(screen.getByLabelText('¿Qué compraste?')).toBeTruthy()
    expect(screen.queryByLabelText('Categoría')).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Gasto' }))
    })
    await asentar(4)
    expect(screen.getByLabelText('Categoría')).toBeTruthy()
  })
})
