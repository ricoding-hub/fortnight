import type { EstadosTarjeta, PlanEdc } from '@/lib/estadoDeCuenta'
import type { CoberturaMsi } from '@/lib/msi'

/**
 * ¿Qué mensualidades MSI cubrieron tus pagos a la tarjeta?
 *
 * Hasta v1.17 una mensualidad se daba por pagada al pasar su fecha límite,
 * pagaras o no. El banco no funciona así: lo que pagas después del corte se
 * aplica primero al mínimo, y el mínimo incluye las mensualidades de ese corte.
 *
 * Aquí, para cada estado de cuenta, lo pagado después de su corte se aplica
 * como lo hace el banco, a lo más viejo primero:
 *   1. lo que quedó debiendo el estado anterior (ese saldo ya va dentro de
 *      este): sin esto, un solo pago cubría las mensualidades de dos cortes;
 *   2. las mensualidades de este corte que marcaste pagadas a mano después del
 *      corte (siguen en el saldo, así que consumen el pago);
 *   3. las demás mensualidades de este corte, el plan más viejo primero.
 * Si el estado ya está pagado completo, todas quedan cubiertas. La primera que
 * no alcanza, y las siguientes, quedan «no cubiertas»: por pagar antes de su
 * fecha límite, y vencidas después.
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

export function coberturaMsi(porTarjeta: Record<string, EstadosTarjeta>, planes: PlanEdc[]): Map<string, Cubierta> {
  const out = new Map<string, Cubierta>()
  for (const et of Object.values(porTarjeta)) {
    if (et.sinCorte) continue
    const delTarjeta = planes
      .filter((p) => p.account_id === et.accountId)
      .sort((a, b) => a.enSaldoDesde.localeCompare(b.enSaldoDesde) || a.id.localeCompare(b.id))
    // Del más viejo al más nuevo: cada uno necesita lo que dejó el anterior.
    const estados = [...et.estados].sort((a, b) => a.corte.localeCompare(b.corte))
    for (let k = 0; k < estados.length; k++) {
      const e = estados[k]
      const anterior = k > 0 ? estados[k - 1] : null
      // Lo pagado entre el corte anterior y éste ya se aplicó a aquél.
      const arrastre = anterior ? Math.max(0, anterior.pngi - (anterior.pagado - e.pagado)) : 0
      if (e.aproximado) continue
      let disponible = e.falta <= EPS ? Infinity : Math.max(0, e.pagado - arrastre)
      for (const p of delTarjeta) {
        if (p.enSaldoDesde > e.corte) continue
        for (const m of p.cal.meses) {
          const marcadaDespues =
            m.corte === e.corte && m.origen === 'manual' && m.estado === 'pagada' && m.marcadaEl != null && m.marcadaEl > e.corte
          if (marcadaDespues) disponible = Math.max(0, disponible - m.monto)
        }
      }
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
