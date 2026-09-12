// @vitest-environment jsdom
/**
 * Monta Inicio de verdad, con el shell entero, contra un doble de Supabase.
 *
 * Esta es la prueba que faltaba cuando se publicó v1.7.5. `tsc`, los 248 tests
 * unitarios y el build pasaron los tres, y aun así la pantalla se quedó en
 * blanco al dibujarse con datos reales: ninguna de las tres cosas llega a
 * ejecutar un componente.
 *
 * Se monta `Layout` y no sólo `Resumen` porque PetCompanion y PaydayBanner
 * viven en el shell y traen sus propios datos: ese es el árbol que reventó, no
 * la vista suelta.
 *
 * El entorno jsdom se declara por archivo a propósito. La configuración global
 * sigue en Node, que es bastante más rápida, y sólo este archivo paga el coste.
 */
import '@/test/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { crearSupabaseDoble, type Filas } from '@/test/supabaseDoble'

/* ── Datos con la forma que devuelve Postgres ─────────────────────────────── */

const HOY = '2026-09-12'

/** Numéricos como cadena: `numeric` de Postgres llega así por PostgREST. */
const CUENTAS = [
  { id: 'a-1', user_id: 'u-1', name: 'Nu', type: 'credit', balance: '48219.44', credit_limit: '70000', cut_day: 12, payment_due_day: 2, payment_grace_days: 20, color: '#8A05BE', logo_domain: 'nu.com.mx', cost_type: 'revolving', apr: '89.5', min_payment_pct: '5', prepay_buffer: '0', sort_order: 0, created_at: '2026-01-02T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' },
  { id: 'a-2', user_id: 'u-1', name: 'BBVA', type: 'debit', balance: '7430.10', credit_limit: null, cut_day: null, payment_due_day: null, payment_grace_days: null, color: '#072146', logo_domain: 'bbva.mx', cost_type: null, apr: null, min_payment_pct: null, prepay_buffer: '0', sort_order: 1, created_at: '2026-01-02T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' },
]

const CATEGORIAS = [
  { id: 'c-1', user_id: 'u-1', name: 'Renta', kind: 'fixed', icon: 'home', color: '#2A4BFF' },
  { id: 'c-2', user_id: 'u-1', name: 'Suscripciones', kind: 'fixed', icon: 'device-tv', color: '#9B7BFF' },
  { id: 'c-3', user_id: 'u-1', name: 'Comida', kind: 'variable', icon: 'tools-kitchen-2', color: '#FFB59E' },
  { id: 'c-4', user_id: 'u-1', name: 'Salario', kind: 'income', icon: 'cash', color: '#2BB673' },
]

const METAS = [
  { id: 'g-1', user_id: 'u-1', name: 'Liberar tarjetas', icon: 'flame', color: '#FF5A5F', target: '60012', saved: '0', monthly: '10502', deadline: '2027-03-12', is_debt: true, is_primary: true, started_at: '2026-09-11', created_at: '2026-09-11T00:00:00Z' },
]

const PLAN = [
  {
    id: 'p-1', user_id: 'u-1', preset: '50-30-20', personal_name: 'Personalizado', personal_snapshot: null,
    created_at: '2026-01-02T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    budget_buckets: [
      { id: 'b-1', plan_id: 'p-1', slug: 'needs', name: 'Necesidades', pct: '50', color: '#2A4BFF', soft_color: '#E6EAFF', sort_order: 0, budget_items: [{ id: 'i-1', bucket_id: 'b-1', slug: 'renta', name: 'Renta', pct: '30', category_id: 'c-1', icon: 'home', sort_order: 0 }] },
      { id: 'b-2', plan_id: 'p-1', slug: 'wants', name: 'Gustos', pct: '30', color: '#FFB59E', soft_color: '#FFF1EC', sort_order: 1, budget_items: [{ id: 'i-2', bucket_id: 'b-2', slug: 'suscripciones', name: 'Suscripciones', pct: '5', category_id: 'c-2', icon: 'device-tv', sort_order: 0 }] },
      { id: 'b-3', plan_id: 'p-1', slug: 'save', name: 'Ahorro', pct: '20', color: '#2BB673', soft_color: '#E4F6EE', sort_order: 2, budget_items: [] },
    ],
  },
]

const CONFIG = [
  { user_id: 'u-1', pay_amount: '9800', pay_freq: 'catorcenal', next_pay_date: '2026-09-18', vales: '1200', fixed_monthly: '8000', variable_monthly: '4500', updated_at: '2026-09-01T00:00:00Z' },
]

const MSI = [
  { id: 'm-1', user_id: 'u-1', account_id: 'a-1', description: 'Refri', total_amount: '18000', monthly_amount: '1500', months_total: 12, months_paid: 3, first_payment_date: '2026-06-12', status: 'active', created_at: '2026-06-01T00:00:00Z' },
]

const SUSCRIPCIONES = [
  { id: 's-1', user_id: 'u-1', name: 'Spotify', amount: '199', frequency: 'monthly', active: true, account_id: 'a-1', category_id: 'c-2', next_charge_date: '2026-09-20', created_at: '2026-01-02T00:00:00Z' },
]

const MOVIMIENTOS = [
  { id: 't-1', user_id: 'u-1', account_id: 'a-2', amount: '-450.5', category_id: 'c-3', description: 'Súper', date: HOY, type: 'transaction', installment_id: null, created_at: '2026-09-12T10:00:00Z' },
  { id: 't-2', user_id: 'u-1', account_id: 'a-2', amount: '9800', category_id: 'c-4', description: 'Catorcena', date: '2026-09-04', type: 'transaction', installment_id: null, created_at: '2026-09-04T10:00:00Z' },
]

const COMPLETO: Filas = {
  accounts: CUENTAS,
  categories: CATEGORIAS,
  goals: METAS,
  goal_accounts: [{ goal_id: 'g-1', account_id: 'a-1' }],
  budget_plans: PLAN,
  user_config: CONFIG,
  installments: MSI,
  subscriptions: SUSCRIPCIONES,
  transactions: MOVIMIENTOS,
}

/* ── Montaje ──────────────────────────────────────────────────────────────── */

/**
 * `vi.mock` se iza, así que el doble se guarda en una variable que la fábrica
 * lee en el momento de la llamada, no al definirse.
 */
let doble = crearSupabaseDoble({ tablas: COMPLETO })
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return doble.cliente
  },
}))

async function montar(
  tablas: Filas,
  errores: Record<string, { message: string; code?: string }> = {},
  ruta: '/' | '/plan/proyeccion' = '/',
) {
  doble = crearSupabaseDoble({ tablas, errores })
  const { Layout } = await import('@/components/Layout')
  const { Resumen } = await import('@/views/Resumen')
  const { Proyeccion } = await import('@/views/Plan/Proyeccion')
  // Proyección lee su contexto del layout de Plan, así que hay que montar el
  // anidamiento de verdad y no la vista suelta.
  const { PlanLayout } = await import('@/views/Plan')
  const { AuthProvider } = await import('@/hooks/useAuth')
  const { GoalsProvider } = await import('@/hooks/useGoals')
  const { BudgetPlanProvider } = await import('@/hooks/useBudgetPlan')

  const vista = render(
    <AuthProvider>
      <GoalsProvider>
        <BudgetPlanProvider>
          <MemoryRouter initialEntries={[ruta]}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Resumen />} />
                <Route path="/plan" element={<PlanLayout />}>
                  <Route path="proyeccion" element={<Proyeccion />} />
                </Route>
              </Route>
            </Routes>
          </MemoryRouter>
        </BudgetPlanProvider>
      </GoalsProvider>
    </AuthProvider>,
  )
  // Esperar a que la vista pinte su contenido y no sólo el armazón: si el test
  // mirara demasiado pronto vería la barra de navegación, daría por bueno el
  // render y se perdería justo el throw que ocurre cuando llegan los datos.
  await esperarA(ruta === '/' ? /Balance neto|Algo se rompió/ : /Proyección|proyecc|Algo se rompió/i)
  // El armazón pinta con ceros antes de que llegue nada: si se comprobara aquí,
  // la prueba estaría afirmando que un esqueleto vacío no revienta, que es
  // justo lo que no falla nunca. Hay que dejar que caigan los datos.
  await asentar()
  return vista
}

/**
 * Espera a que el texto aparezca, flushando los efectos en cada vuelta.
 *
 * A mano y no con `waitFor`: en la primera prueba del archivo, mientras vitest
 * todavía está resolviendo los imports dinámicos, `waitFor` resuelve antes de
 * que el árbol haya pintado nada y la comprobación siguiente mira un DOM vacío.
 * Un bucle explícito no tiene esa carrera.
 */
async function esperarA(patron: RegExp, msTotal = 10_000): Promise<void> {
  const limite = Date.now() + msTotal
  while (Date.now() < limite) {
    if (patron.test(document.body.textContent ?? '')) return
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25))
    })
  }
  throw new Error(
    `La vista nunca pintó ${patron}. Lo que hay en pantalla: ` +
      `"${(document.body.textContent ?? '').slice(0, 300)}"`,
  )
}

/** Deja que se resuelvan las consultas y los efectos que dependen de ellas. */
async function asentar(vueltas = 24): Promise<void> {
  for (let i = 0; i < vueltas; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
  }
}

function seCayo(): boolean {
  return !!document.body.textContent?.includes('Algo se rompió en esta pantalla')
}

/* ── Pruebas ──────────────────────────────────────────────────────────────── */

describe('Inicio se dibuja', () => {
  afterEach(cleanup)

  it('con datos completos', { timeout: 20_000 }, async () => {
    await montar(COMPLETO)
    expect(seCayo()).toBe(false)
    // Sin esto la prueba se contentaría con el esqueleto: la cifra sólo aparece
    // cuando las consultas ya volvieron y la vista se volvió a dibujar con ellas.
    expect(document.body.textContent).toContain('48,219.44')
    expect(doble.consultas.length).toBeGreaterThan(0)
  })

  it('con un usuario recién creado, sin nada', async () => {
    await montar({})
    expect(seCayo()).toBe(false)
  })

  it('cuando pay_freq trae un valor que no conocemos', async () => {
    // Columna de texto: puede llegar una frecuencia nueva a un cliente viejo, o
    // una fila migrada a mano. `PAY_FREQS[freq].cyclesPerMonth` con eso dentro
    // es un TypeError al dibujar, y el `as PayFreq` no lo detiene.
    await montar({ ...COMPLETO, user_config: [{ ...CONFIG[0], pay_freq: 'decenal' }] })
    expect(seCayo()).toBe(false)
  })

  it('con movimientos cuya categoría ya no existe', async () => {
    // Borrar una categoría deja movimientos apuntando a una fila que ya no
    // está. `categorias.find(...)` devuelve undefined y cualquier `.name`
    // detrás revienta al dibujar.
    await montar({
      ...COMPLETO,
      transactions: [{ ...MOVIMIENTOS[0], category_id: 'c-borrada' }],
    })
    expect(seCayo()).toBe(false)
  })

  it('con una meta cuyo aporte mensual es cero', async () => {
    // monthsToGoal divide por `monthly`: con 0 sale Infinity, y una fecha
    // construida sobre Infinity es Invalid Date.
    await montar({ ...COMPLETO, goals: [{ ...METAS[0], monthly: '0' }] })
    expect(seCayo()).toBe(false)
    expect(document.body.textContent).not.toContain('Invalid Date')
    expect(document.body.textContent).not.toContain('NaN')
  })

  it('cuando la consulta de cuentas falla entera', async () => {
    await montar(COMPLETO, { accounts: { message: 'network', code: '500' } })
    expect(seCayo()).toBe(false)
  })

  it('sin plan de presupuesto ni configuración de pago', async () => {
    await montar({ ...COMPLETO, budget_plans: [], user_config: [] })
    expect(seCayo()).toBe(false)
  })

  it('con una tarjeta sin límite ni fechas de corte', async () => {
    await montar({
      ...COMPLETO,
      accounts: [{ ...CUENTAS[0], credit_limit: null, cut_day: null, payment_due_day: null }],
    })
    expect(seCayo()).toBe(false)
  })
})

describe('Proyección se dibuja', () => {
  afterEach(cleanup)

  it('con datos completos', { timeout: 20_000 }, async () => {
    // Proyección tenía el mismo doble consumidor que Inicio: useSubscriptions
    // directo en la vista y otro por dentro de useDebtFreeMonth. Con el canal
    // nombrado `subs:${user.id}`, el segundo recibía el canal ya suscrito del
    // primero y `.on()` lanzaba. Las dos pantallas caían, no sólo Inicio.
    await montar(COMPLETO, {}, '/plan/proyeccion')
    expect(seCayo()).toBe(false)
  })

  it('sin nada configurado', async () => {
    await montar({}, {}, '/plan/proyeccion')
    expect(seCayo()).toBe(false)
  })
})

describe('los hooks que siembran filas', () => {
  afterEach(cleanup)

  it('insertan como mucho una fila, y no se quedan reintentando', { timeout: 20_000 }, async () => {
    // Dos fallos en uno.
    //
    // Uno: useGoals y useBudgetPlan se llamaban sueltos y cada consumidor traía
    // su propio efecto de siembra con su propio ref, así que un usuario nuevo
    // con deuda podía acabar con varias filas de "Liberar tarjetas".
    //
    // Dos, y peor: la marca se liberaba al terminar el insert. Aquí el doble
    // nunca devuelve la fila insertada — igual que una inserción que falla por
    // permisos —, así que el efecto volvía a dispararse en cuanto `data`
    // cambiaba de identidad y la siembra se repetía sin fin. Esta prueba se
    // quedaba colgada; ese bucle en un teléfono deja la pestaña clavada.
    await montar({ ...COMPLETO, goals: [], goal_accounts: [], budget_plans: [] })
    await asentar(40)
    expect(doble.consultas.filter((q) => q === 'goals.insert').length).toBe(1)
    expect(doble.consultas.filter((q) => q === 'budget_plans.insert').length).toBeLessThanOrEqual(1)
  })
})
