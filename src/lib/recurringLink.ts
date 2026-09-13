import type { BucketWithItems, Category, Subscription } from '@/types'
import { subMonthlyAmount } from '@/lib/projections'

/** Lo que un cargo recurrente aporta a una partida del plan. */
export interface EnlaceCargo {
  /** La partida del plan que este cargo alimenta. */
  itemId: string
  itemName: string
  bucketSlug: string
  bucketName: string
  /** Suma mensual de los cargos de esa categoría. */
  mensual: number
  /** Los cargos, para poder enseñarlos. */
  cargos: Subscription[]
}

/**
 * Qué partida del plan alimenta cada categoría con cargos recurrentes.
 *
 * Una regla, un sitio. Antes vivía dos veces: dentro de `useMonthlyDisposable`,
 * para descontar del sobre lo que ya se cobra de verdad, y dentro de
 * `Presupuesto`, cableada a la categoría "Suscripciones" y a mano. Que la misma
 * decisión estuviera escrita dos veces es lo que hizo divergir Inicio y
 * Proyección hace tres versiones; no hay motivo para repetirlo.
 *
 * La regla: **una categoría acredita una sola partida**, la primera recorriendo
 * los sobres en orden. Una categoría puede aparecer en varias — en el plan por
 * omisión, "Comida" está en Despensa (necesidades) y en Comida fuera (gustos) —
 * y acreditar ambas libera del presupuesto más dinero del que el cargo ocupa.
 *
 * Se acredita por categoría y no por cargo a propósito: con dos cargos de la
 * misma categoría no hay forma de saber cuál corresponde a qué partida, y
 * quedarse corto deja el disponible algo pesimista, mientras que pasarse hace
 * creer que hay dinero que no hay.
 */
export function enlacesPorCategoria(
  buckets: BucketWithItems[],
  cargos: Subscription[],
): Map<string, EnlaceCargo> {
  const activos = cargos.filter((c) => c.active && c.category_id)

  const porCategoria = new Map<string, Subscription[]>()
  for (const c of activos) {
    const lista = porCategoria.get(c.category_id!) ?? []
    lista.push(c)
    porCategoria.set(c.category_id!, lista)
  }

  const out = new Map<string, EnlaceCargo>()
  for (const b of buckets) {
    for (const it of b.items) {
      if (!it.category_id) continue
      if (out.has(it.category_id)) continue // ya acreditada en un sobre anterior
      const lista = porCategoria.get(it.category_id)
      if (!lista?.length) continue
      out.set(it.category_id, {
        itemId: it.id,
        itemName: it.name,
        bucketSlug: b.slug,
        bucketName: b.name,
        mensual: lista.reduce((n, c) => n + subMonthlyAmount(c.amount, c.frequency), 0),
        cargos: lista,
      })
    }
  }
  return out
}

/** Lo presupuestado que se libera en cada sobre, por su `slug`. */
export function liberadoPorSobre(
  buckets: BucketWithItems[],
  enlaces: Map<string, EnlaceCargo>,
  ingresoMensual: number,
): Map<string, number> {
  const porItem = new Map<string, true>()
  for (const e of enlaces.values()) porItem.set(e.itemId, true)

  const out = new Map<string, number>()
  for (const b of buckets) {
    const suma = b.items
      .filter((it) => porItem.has(it.id))
      .reduce((n, it) => n + (it.pct * ingresoMensual) / 100, 0)
    out.set(b.slug, suma)
  }
  return out
}

/** El enlace de un cargo concreto, para enseñarlo en su tarjeta. */
export function enlaceDelCargo(
  cargo: Subscription,
  enlaces: Map<string, EnlaceCargo>,
): EnlaceCargo | null {
  if (!cargo.category_id) return null
  return enlaces.get(cargo.category_id) ?? null
}

/**
 * Rellena la categoría que falta en las suscripciones.
 *
 * El formulario de suscripciones no pregunta categoría — a Netflix no se le
 * elige una, es obvia — pero sin ella el cargo no encontraría su partida y su
 * importe se restaría dos veces: una en el sobre de "Suscripciones" del plan y
 * otra como cargo real.
 *
 * Antes esto era un caso especial escondido dentro del cálculo del disponible.
 * Aquí está a la vista y lo usan los dos consumidores, así que no puede aplicar
 * en un sitio y olvidarse en el otro.
 */
export function conCategoriaPorDefecto(
  cargos: Subscription[],
  categorias: Category[],
): Subscription[] {
  const suscripciones = categorias.find((c) => c.name.toLowerCase() === 'suscripciones')
  if (!suscripciones) return cargos
  return cargos.map((c) =>
    c.kind !== 'fijo' && !c.category_id ? { ...c, category_id: suscripciones.id } : c,
  )
}
