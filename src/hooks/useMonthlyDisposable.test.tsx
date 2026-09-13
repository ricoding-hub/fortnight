// @vitest-environment jsdom
/**
 * El doble conteo, que es el fallo silencioso de dar de alta un gasto fijo.
 *
 * El plan presupuesta un porcentaje a "necesidades", y ahí dentro va la renta.
 * Si además se registra la renta como cargo con fecha y se resta entera, el
 * mismo dinero sale dos veces del disponible y la app dice que te queda menos
 * de lo que te queda. No se ve: sólo da un número más bajo.
 */
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { crearSupabaseDoble, type Filas } from '@/test/supabaseDoble'

let doble = crearSupabaseDoble()
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return doble.cliente
  },
}))

afterEach(cleanup)

const CATEGORIAS = [
  { id: 'c-renta', user_id: 'u-1', name: 'Renta', kind: 'fixed', icon: null, color: null },
  { id: 'c-comida', user_id: 'u-1', name: 'Comida', kind: 'variable', icon: null, color: null },
  { id: 'c-subs', user_id: 'u-1', name: 'Suscripciones', kind: 'fixed', icon: null, color: null },
]

/** Ingreso mensual redondo para que la aritmética se lea de un vistazo. */
const CONFIG = [{ user_id: 'u-1', pay_amount: '5000', pay_freq: 'quincenal', next_pay_date: '2026-09-18', updated_at: '2026-09-01T00:00:00Z' }]

const PLAN = [{
  id: 'p-1', user_id: 'u-1', preset: '50-30-20', personal_name: 'Personalizado', personal_snapshot: null,
  created_at: '2026-01-02T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
  budget_buckets: [
    {
      id: 'b-1', plan_id: 'p-1', slug: 'needs', name: 'Necesidades', pct: '50',
      color: '#2A4BFF', soft_color: '#E6EAFF', sort_order: 0,
      budget_items: [
        { id: 'i-1', bucket_id: 'b-1', slug: 'renta', name: 'Renta', pct: '30', category_id: 'c-renta', icon: null, sort_order: 0 },
        // Despensa y "Comida fuera" comparten categoría, igual que en la
        // semilla real del plan. Ahí es donde se resta de más.
        { id: 'i-2', bucket_id: 'b-1', slug: 'food', name: 'Despensa', pct: '13', category_id: 'c-comida', icon: null, sort_order: 1 },
      ],
    },
    {
      id: 'b-2', plan_id: 'p-1', slug: 'wants', name: 'Gustos', pct: '30',
      color: '#FFB59E', soft_color: '#FFF1EC', sort_order: 1,
      budget_items: [
        { id: 'i-3', bucket_id: 'b-2', slug: 'out', name: 'Comida fuera', pct: '8', category_id: 'c-comida', icon: null, sort_order: 0 },
      ],
    },
    { id: 'b-3', plan_id: 'p-1', slug: 'save', name: 'Ahorro', pct: '20', color: '#2BB673', soft_color: '#E4F6EE', sort_order: 2, budget_items: [] },
  ],
}]

const RENTA = {
  id: 'f1', user_id: 'u-1', account_id: null, kind: 'fijo', name: 'Renta',
  amount: '3000', frequency: 'mensual', charge_day: 5, category_id: 'c-renta',
  brand_id: null, color: null, notes: null, active: true,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

async function leer(tablas: Filas) {
  doble = crearSupabaseDoble({ tablas })
  const { useMonthlyDisposable } = await import('@/hooks/useMonthlyDisposable')
  const { AuthProvider } = await import('@/hooks/useAuth')
  const { BudgetPlanProvider } = await import('@/hooks/useBudgetPlan')

  let visto: ReturnType<typeof useMonthlyDisposable> | null = null
  function Sonda() {
    visto = useMonthlyDisposable()
    return null
  }
  render(
    <AuthProvider>
      <BudgetPlanProvider>
        <Sonda />
      </BudgetPlanProvider>
    </AuthProvider>,
  )
  for (let i = 0; i < 24; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
  }
  return visto!
}

describe('useMonthlyDisposable con gastos fijos', () => {
  it('resta la renta una sola vez, no dos', async () => {
    // Ingreso 10,000 (5,000 quincenal × 2).
    //   necesidades 50 %  → 5,000, y dentro la renta ocupa 30 % → 3,000
    //   gustos      30 %  → 3,000
    //   cargo real de la renta → 3,000
    //
    // Mal:  10,000 − 5,000 − 3,000 − 3,000 = −1,000  ← el sobre entero Y el cargo
    // Bien: 10,000 − 2,000 − 3,000 − 3,000 =  2,000  ← al sobre se le quita la renta
    //
    // Los 3,000 de diferencia son exactamente la renta contada dos veces.
    const r = await leer({
      user_config: CONFIG, budget_plans: PLAN, categories: CATEGORIAS,
      subscriptions: [RENTA], installments: [], accounts: [],
    })
    expect(r.monthlyIncome).toBe(10_000)
    expect(r.fijosMonthly).toBe(3000)
    expect(r.fixedMonthly).toBe(2000)
    expect(r.disposable).toBe(2000)
  })

  it('sin gastos fijos registrados, el sobre queda entero', async () => {
    const r = await leer({
      user_config: CONFIG, budget_plans: PLAN, categories: CATEGORIAS,
      subscriptions: [], installments: [], accounts: [],
    })
    expect(r.fijosMonthly).toBe(0)
    expect(r.fixedMonthly).toBe(5000)
    expect(r.disposable).toBe(2000)
  })

  it('un gasto fijo sin categoría sí se resta entero, porque no está presupuestado', async () => {
    // Sin categoría no hay nada que descontar del sobre: es un gasto que el plan
    // no contemplaba, y restarlo encima es lo correcto. Que dé negativo no es un
    // fallo — es que 3,000 que nadie presupuestó no caben.
    const r = await leer({
      user_config: CONFIG, budget_plans: PLAN, categories: CATEGORIAS,
      subscriptions: [{ ...RENTA, category_id: null }], installments: [], accounts: [],
    })
    expect(r.fixedMonthly).toBe(5000)
    expect(r.disposable).toBe(-1000)
  })

  it('la diferencia entre categorizarlo y no es exactamente el gasto', async () => {
    // La comprobación que de verdad fija el arreglo: si el descuento del sobre
    // se rompiera, estos dos darían lo mismo.
    const base = { user_config: CONFIG, budget_plans: PLAN, categories: CATEGORIAS, installments: [], accounts: [] }
    const conCategoria = await leer({ ...base, subscriptions: [RENTA] })
    const sinCategoria = await leer({ ...base, subscriptions: [{ ...RENTA, category_id: null }] })
    expect(conCategoria.disposable - sinCategoria.disposable).toBe(3000)
  })

  it('separa gastos fijos de suscripciones', async () => {
    const netflix = { ...RENTA, id: 's1', kind: 'suscripcion', name: 'Netflix', amount: '299', category_id: null }
    const r = await leer({
      user_config: CONFIG, budget_plans: PLAN, categories: CATEGORIAS,
      subscriptions: [RENTA, netflix], installments: [], accounts: [],
    })
    expect(r.fijosMonthly).toBe(3000)
    expect(r.subsMonthly).toBe(299)
  })
})

describe('una categoría que está en dos sobres', () => {
  const despensa = { ...RENTA, id: 'f2', name: 'Despensa', amount: '2000', category_id: 'c-comida' }
  const base = {
    user_config: CONFIG, budget_plans: PLAN, categories: CATEGORIAS,
    installments: [], accounts: [],
  }

  it('sólo libera UNA partida, no las dos', async () => {
    // "Comida" aparece en Despensa (necesidades, 13 %) y en Comida fuera
    // (gustos, 8 %). Con un cargo de esa categoría se liberaban las dos: 21 %
    // del ingreso por un solo gasto. El disponible salía demasiado optimista,
    // que es la dirección mala del error en una app de finanzas.
    //
    // Ingreso 10,000. Necesidades 50 % = 5,000, menos Despensa 13 % = 1,300 → 3,700.
    // Gustos 30 % = 3,000, intacto.
    const r = await leer({ ...base, subscriptions: [despensa] })
    expect(r.fixedMonthly).toBe(3700)
    expect(r.variableMonthly).toBe(3000)
    expect(r.disposable).toBe(10_000 - 3700 - 3000 - 2000)
  })

  it('dos cargos de la misma categoría tampoco la liberan dos veces', async () => {
    // No se puede saber cuál corresponde a qué partida, así que se acredita una
    // sola vez. Quedarse corto deja el disponible algo pesimista; pasarse hace
    // creer que hay dinero que no hay.
    const otro = { ...despensa, id: 'f3', name: 'Súper quincenal', amount: '800' }
    const r = await leer({ ...base, subscriptions: [despensa, otro] })
    expect(r.fixedMonthly).toBe(3700)
    expect(r.variableMonthly).toBe(3000)
    expect(r.fijosMonthly).toBe(2800)
  })

  it('una categoría que el plan no usa no libera nada', async () => {
    const r = await leer({
      ...base,
      subscriptions: [{ ...despensa, category_id: 'c-subs' }],
    })
    expect(r.fixedMonthly).toBe(5000)
    expect(r.variableMonthly).toBe(3000)
  })
})
