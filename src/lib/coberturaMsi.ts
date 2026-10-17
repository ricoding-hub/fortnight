import type { EstadosTarjeta, PlanEdc } from '@/lib/estadoDeCuenta'
import type { CoberturaMsi } from '@/lib/msi'

/**
 * ¿Qué mensualidades MSI cubrieron tus pagos a la tarjeta?
 *
 * Hasta v1.17 una mensualidad se daba por pagada al pasar su fecha límite,
 * pagaras o no. El banco no funciona así: lo que pagas después del corte se
 * aplica primero al mínimo, y el mínimo incluye las mensualidades de ese corte.
 *
 * Aquí, para cada estado de cuenta, lo pagado se reparte entre sus
 * mensualidades en orden (el plan más viejo primero). Si el estado ya está
 * pagado completo, todas quedan cubiertas. La primera que no alcanza, y las
 * siguientes, quedan «no cubiertas»: por pagar antes de su fecha límite, y
 * vencidas después.
 *
 * Donde el estado de cuenta no es confiable, no se opina (decide la fecha):
 *   · el estado es aproximado (cuenta dada de alta después del corte, o MSI
 *     que no están en el saldo);
 *   · el plan se registró, o su cargo entró al saldo, después de ese corte;
 *   · la mensualidad tiene una marca a mano (ésa gana) o venía del contador viejo;
 *   · el corte quedó fuera de la ventana de movimientos (no hay estado).
 */

export type Cubierta = 'cubierta' | 'no-cubierta'

const EPS = 0.005

const clave = (planId: string, n: number) => `${planId}:${n}`

export function coberturaMsi(estados: Record<string, EstadosTarjeta>, planes: PlanEdc[]): Map<string, Cubierta> {
  const out = new Map<string, Cubierta>()
  for (const et of Object.values(estados)) {
    if (et.sinCorte) continue
    const delTarjeta = planes
      .filter((p) => p.account_id === et.accountId)
      .sort((a, b) => a.enSaldoDesde.localeCompare(b.enSaldoDesde) || a.id.localeCompare(b.id))
    for (const e of et.estados) {
      if (e.aproximado) continue
      let disponible = e.falta <= EPS ? Infinity : e.pagado
      let alcanza = true
      for (const p of delTarjeta) {
        if (e.corte < p.registrado || e.corte < p.enSaldoDesde) continue
        for (const m of p.cal.meses) {
          if (m.corte !== e.corte || m.origen !== 'auto') continue
          if (alcanza && disponible + EPS >= m.monto) {
            disponible -= m.monto
            out.set(clave(p.id, m.n), 'cubierta')
          } else {
            alcanza = false
            out.set(clave(p.id, m.n), 'no-cubierta')
          }
        }
      }
    }
  }
  return out
}

/** La cobertura de un plan, lista para `calendarioMsi`/`vivo`. */
export function coberturaDe(mapa: Map<string, Cubierta>, planId: string): CoberturaMsi {
  return (n) => mapa.get(clave(planId, n)) ?? null
}
