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
 *   1. las mensualidades de cortes anteriores que tus pagos no alcanzaron
 *      (`arrastreMsi`, un libro que lleva el estado de cuenta desde el corte
 *      más viejo): sin esto, un solo pago cubría las mensualidades de varios
 *      cortes. Sólo las mensualidades, no todo lo que se debía: quien paga el
 *      mínimo cada mes sí las cubre, porque el mínimo las incluye;
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
      const pagadoCompleto = e.falta <= EPS
      // El primero de la ventana no tiene anterior: no se sabe qué arrastra.
      // La ventana empieza un corte antes de la 1ª mensualidad de cada plan,
      // así que normalmente no trae mensualidades.
      if (k === 0 && !pagadoCompleto) continue
      const anterior = k > 0 ? estados[k - 1] : null
      if (e.aproximado) continue
      // Un anterior aproximado (de antes de dar de alta la tarjeta) no dice
      // cuánto se arrastra: si éste no está pagado, decide la fecha.
      if (anterior?.aproximado && !pagadoCompleto) continue
      // El mismo libro del estado de cuenta: lo que quedó sin cubrir de las
      // mensualidades de cortes anteriores va primero.
      let disponible = pagadoCompleto ? Infinity : Math.max(0, e.pagado - e.arrastreMsi)
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
