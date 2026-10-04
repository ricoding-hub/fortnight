import { describe, expect, it } from 'vitest'
import {
  agruparPorDia,
  construirMovimientos,
  filtrarMovimientos,
  resumirMovimientos,
  type EntradaMovimientos,
} from '@/lib/groupMovements'
import { memberNets, toCents } from '@/lib/split'
import type { SplitExpense, SplitExpenseShare, SplitSettlement } from '@/types'

const YO = 'm-yo'
const ALE = 'm-ale'
const NOMBRES: Record<string, string> = { [YO]: 'Richy', [ALE]: 'Alesita' }
const iso = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString()

function gasto(id: string, desc: string, total: number, pagador: string, fecha: string, creado: string): SplitExpense {
  return {
    id, group_id: 'g', user_id: pagador === YO ? 'u-yo' : 'u-ale', description: desc, amount: total,
    paid_by_member_id: pagador, split_method: 'equal', account_id: null, category_id: null,
    expense_date: fecha, created_at: creado,
  }
}
const mitad = (id: string, total: number): SplitExpenseShare[] => [
  { id: `${id}a`, expense_id: id, member_id: YO, user_id: 'u', amount: total / 2, weight: null, group_id: 'g', created_at: '' },
  { id: `${id}b`, expense_id: id, member_id: ALE, user_id: 'u', amount: total / 2, weight: null, group_id: 'g', created_at: '' },
]
function liquidacion(id: string, de: string, a: string, monto: number, gastoId: string | null, creado: string): SplitSettlement {
  return { id, group_id: 'g', user_id: 'u', from_member_id: de, to_member_id: a, amount: monto, note: null, account_id: null, expense_id: gastoId, created_at: creado }
}

const G1 = gasto('e1', 'Wings Army', 540, YO, '2026-09-23', iso(2026, 9, 23))
const G2 = gasto('e2', 'Cambio de la gas', 170, ALE, '2026-09-29', iso(2026, 10, 4)) // registrado 5 días después
const G3 = gasto('e3', 'Van cantaritos', 320, ALE, '2026-10-01', iso(2026, 10, 1))
const SHARES = new Map([['e1', mitad('e1', 540)], ['e2', mitad('e2', 170)], ['e3', mitad('e3', 320)]])

function entrada(over: Partial<EntradaMovimientos> = {}): EntradaMovimientos {
  return {
    expenses: [G1, G2, G3], settlements: [], sharesByExpense: SHARES, meId: YO,
    nombreDeMiembro: (id) => NOMBRES[id] ?? '—', nombreDeUsuario: () => null, categoria: () => null, ...over,
  }
}

describe('construirMovimientos', () => {
  it('una lista cronológica, lo más reciente primero', () => {
    expect(construirMovimientos(entrada()).map((m) => m.id)).toEqual(['e3', 'e2', 'e1'])
  })

  it('ordena por el día del GASTO, no por el del registro', () => {
    // G2 se registró el 4 de oct pero se gastó el 29 de sep: va antes que el
    // del 1 de oct pero después... no: el 1 de oct es posterior al 29 de sep.
    const orden = construirMovimientos(entrada()).map((m) => m.dia)
    expect(orden).toEqual(['2026-10-01', '2026-09-29', '2026-09-23'])
  })

  it('avisa cuándo se registró, sólo cuando difiere', () => {
    const m = construirMovimientos(entrada())
    expect(m.find((x) => x.id === 'e2')!.registrado).toBe('2026-10-04')
    expect(m.find((x) => x.id === 'e1')!.registrado).toBeNull()
  })

  it('lo tuyo es el impacto personal, no el total', () => {
    const m = construirMovimientos(entrada())
    expect(m.find((x) => x.id === 'e1')!.neto).toBe(270)   // pagaste 540, tu parte 270
    expect(m.find((x) => x.id === 'e2')!.neto).toBe(-85)   // debes tu mitad
  })

  it('una liquidación enlazada deja el gasto saldado', () => {
    const m = construirMovimientos(entrada({
      settlements: [liquidacion('s1', YO, ALE, 85, 'e2', iso(2026, 10, 4))],
    }))
    const e2 = m.find((x) => x.id === 'e2')!
    expect(e2.saldado).toBe(true)
    expect(e2.pendiente).toBe(0)
  })
})

describe('la propiedad que hace auditable la lista', () => {
  it('sumar las filas da exactamente el saldo del encabezado', () => {
    const sets = [liquidacion('s1', YO, ALE, 85, 'e2', iso(2026, 10, 4)), liquidacion('s2', ALE, YO, 100, null, iso(2026, 10, 5))]
    const items = construirMovimientos(entrada({ settlements: sets }))

    const nets = memberNets(
      [YO, ALE],
      [G1, G2, G3].map((g) => ({
        paidByMemberId: g.paid_by_member_id,
        totalCents: toCents(g.amount),
        shares: new Map(SHARES.get(g.id)!.map((s) => [s.member_id, toCents(s.amount)])),
      })),
      sets.map((s) => ({ fromMemberId: s.from_member_id, toMemberId: s.to_member_id, amountCents: toCents(s.amount) })),
    )
    expect(Math.round(resumirMovimientos(items, 'todos').total * 100)).toBe(nets.get(YO))
  })
})

describe('filtrarMovimientos', () => {
  const items = construirMovimientos(entrada({
    settlements: [liquidacion('s1', YO, ALE, 85, 'e2', iso(2026, 10, 4))],
  }))

  it('«Te deben»: sólo gastos con algo por cobrar', () => {
    expect(filtrarMovimientos(items, 'te-deben', '').map((m) => m.id).sort()).toEqual(['e1'])
  })

  it('«Debes»: sólo gastos con algo por pagar — y el saldado ya no cuenta', () => {
    // e3 se debe (-160); e2 ya se saldó con s1.
    expect(filtrarMovimientos(items, 'debes', '').map((m) => m.id)).toEqual(['e3'])
  })

  it('«Saldados»: gastos saldados y los pagos', () => {
    expect(filtrarMovimientos(items, 'saldados', '').map((m) => m.id).sort()).toEqual(['e2', 's1'])
  })

  it('la búsqueda se combina con el chip', () => {
    expect(filtrarMovimientos(items, 'todos', 'wings').map((m) => m.id)).toEqual(['e1'])
    expect(filtrarMovimientos(items, 'debes', 'wings')).toEqual([])
  })

  it('busca por monto con símbolos', () => {
    expect(filtrarMovimientos(items, 'todos', '$540').map((m) => m.id)).toEqual(['e1'])
  })
})

describe('resumirMovimientos', () => {
  const items = construirMovimientos(entrada())

  it('con «Debes» suma lo pendiente, no el total de los gastos', () => {
    const r = resumirMovimientos(filtrarMovimientos(items, 'debes', ''), 'debes')
    expect(r).toEqual({ cuenta: 2, total: -245 }) // 85 + 160
  })

  it('con «Te deben» suma lo que falta cobrar', () => {
    expect(resumirMovimientos(filtrarMovimientos(items, 'te-deben', ''), 'te-deben').total).toBe(270)
  })
})

describe('agruparPorDia', () => {
  it('agrupa lo del mismo día y respeta el orden', () => {
    const g = agruparPorDia(construirMovimientos(entrada()))
    expect(g.map((d) => d.dia)).toEqual(['2026-10-01', '2026-09-29', '2026-09-23'])
    expect(g.every((d) => d.items.length === 1)).toBe(true)
  })
})
