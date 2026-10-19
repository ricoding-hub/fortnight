import { corteEn, venceDelCorte, type CicloTarjeta } from '@/lib/cardCycle'
import { addDays, fromKey, toKey } from '@/lib/localDate'
import { calendarioMsi, fechaDeCompra, registradoEl, type CalendarioMsi, type CargoMsi, type MesMsi } from '@/lib/msi'
import type { Account, Installment, TransactionType } from '@/types'

/**
 * El estado de cuenta de una tarjeta, como lo calcula el banco.
 *
 * Hasta v1.16 la app no tenía esta idea: el aviso «Paga MercadoPago hoy» ponía
 * el saldo completo de la tarjeta — con todas las mensualidades MSI que aún no
 * se cobran y las compras posteriores al corte — y nunca sabía si ya pagaste.
 *
 * Aquí, para cada corte reciente:
 *
 *   saldo al corte = saldo de hoy − lo que se movió en la tarjeta después del corte
 *   MSI que aún no se cobra = mensualidades de cortes posteriores, de planes cuya
 *                    compra ya estaba en el saldo en ese corte
 *   pago para no generar intereses (PNGI) = saldo al corte − MSI que aún no se cobra
 *   pagado = abonos después del corte (pagos, reembolsos, ajustes a la baja)
 *   te falta = PNGI − pagado
 *
 * Un pago antes o después del corte da lo mismo (sólo cambia dónde se resta);
 * lo que importa es la fecha de las compras. Si la persona captura la cifra de
 * su estado de cuenta, ésa manda sobre el cálculo.
 *
 * Todo puro y en días locales (`YYYY-MM-DD`): se prueba sin red ni reloj.
 */

export type TarjetaEdc = Pick<
  Account,
  'id' | 'name' | 'type' | 'balance' | 'credit_limit' | 'cut_day' | 'payment_due_day' | 'payment_grace_days' | 'min_payment_pct' | 'created_at'
>

export interface MovEdc {
  id: string
  account_id: string
  amount: number | string
  date: string
  type: TransactionType
  transfer_id?: string | null
  installment_id?: string | null
  category_id?: string | null
  description?: string | null
  created_at?: string | null
  source?: string | null
}

/** Un plan MSI visto desde su tarjeta: su calendario por fechas y desde cuándo está en el saldo. */
export interface PlanEdc {
  id: string
  account_id: string | null
  /** Desde cuándo el capital está dentro del saldo: la fecha del cargo, o la de compra. */
  enSaldoDesde: string
  /** Día en que se registró el plan en la app. */
  registrado: string
  cal: CalendarioMsi
}

export interface CorreccionEdc {
  account_id: string
  cut_date: string
  no_interest_amount: number | string | null
  min_amount: number | string | null
}

export type EstadoEdc = 'sin-saldo' | 'pagado' | 'pendiente' | 'vencido'

export interface EstadoDeCuenta {
  accountId: string
  corte: string
  vence: string
  venceEstimado: boolean
  saldoAlCorte: number
  msiNoFacturado: number
  msiDelCorte: number
  pngiCalculado: number
  /** Pago para no generar intereses: el calculado, o el del banco si se capturó. */
  pngi: number
  corregido: boolean
  abonos: MovEdc[]
  pagado: number
  /**
   * Lo abonado a este estado antes del siguiente corte (cada abono con la regla
   * de ESTE estado). Lo que no alcanzó a cubrir del mínimo se arrastra al
   * siguiente: ver `coberturaMsi`.
   */
  pagadoAntesDelSiguiente: number
  falta: number
  /**
   * Pago mínimo (aprox.): el de este corte más lo que quedó sin pagar del
   * mínimo de los anteriores, como lo suma el banco. O el que capturaste.
   */
  minimo: number
  /** El pago mínimo que capturaste de tu estado de cuenta, si lo hiciste. */
  minimoBanco: number | null
  minimoFalta: number
  /**
   * Mensualidades MSI de cortes anteriores que tus pagos no alcanzaron a cubrir
   * antes de este corte: lo primero que se lleva lo que pagues. Es un libro que
   * corre desde el corte más viejo, así que un faltante de hace dos estados no
   * se pierde, y no depende del límite ni del % de la tarjeta.
   */
  arrastreMsi: number
  /** Lo que quedó sin pagar de los mínimos anteriores (va dentro de `minimo`). */
  arrastreMinimo: number
  /** Compras después del corte: van al siguiente estado. */
  compras: number
  /** Ajustes al alza después del corte: se toman como compras nuevas. */
  ajustesAlAlza: number
  estado: EstadoEdc
  /** Ya quedó dentro de un corte más nuevo: no se vuelve a contar. */
  absorbido: boolean
  /** Por qué la cifra es aproximada, además de no estar corregida. */
  aproximado: null | 'alta' | 'msi-sin-respaldo'
}

export interface EstadosTarjeta {
  accountId: string
  sinCorte: boolean
  estados: EstadoDeCuenta[]
  /** El que toca pagar: el de fecha límite más cercana que aún debe algo. */
  proximo: EstadoDeCuenta | null
  /** El del corte más reciente. */
  ultimo: EstadoDeCuenta | null
  /** El ciclo en curso: cuándo corta, cuándo vence y cuánto llevaría hoy. */
  siguiente: { corte: string; vence: string; estimado: number } | null
}

const EPS = 0.005
const r2 = (n: number) => Math.round(n * 100) / 100

function num(v: unknown): number {
  if (v == null || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function numONulo(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function diaLocal(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : toKey(d)
}

function dias(a: string, b: string): number {
  return Math.round((fromKey(a).getTime() - fromKey(b).getTime()) / 86_400_000)
}

/** Un plan visto desde su tarjeta. `cal` es el calendario por fechas (sin pagos). */
export function planEdc(inst: Installment, ciclo: CicloTarjeta | null, cargo: CargoMsi | null, hoy: string): PlanEdc {
  return {
    id: inst.id,
    account_id: inst.account_id,
    enSaldoDesde: cargo?.date ? String(cargo.date).slice(0, 10) : fechaDeCompra(inst, hoy),
    // Un gasto convertido estaba en la tarjeta desde la compra: sus cortes
    // también los deciden tus pagos, no sólo los posteriores a convertirlo.
    registrado: cargo?.adoptado ? fechaDeCompra(inst, hoy) : registradoEl(inst, hoy),
    cal: calendarioMsi(inst, ciclo, hoy),
  }
}

/** Cuántos días hacia atrás hay que mirar: la gracia y dos ciclos más. */
function diasHaciaAtras(c: CicloTarjeta): number {
  const g = num(c.payment_grace_days)
  return (g > 0 ? g : 31) + 62
}

/**
 * Los cortes ya ocurridos que todavía importan, del más viejo al más nuevo
 * (máx. 13). `desdeMinimo`: si hay planes MSI más viejos que la ventana normal,
 * se mira hasta su compra — si no, una mensualidad sin pagar «se pagaba sola»
 * al salir de la ventana.
 */
export function cortesParaEstados(c: CicloTarjeta, hoy: string, desdeMinimo?: string | null): string[] {
  const h = fromKey(hoy)
  const normal = toKey(addDays(h, -diasHaciaAtras(c)))
  const desde = desdeMinimo && desdeMinimo < normal ? desdeMinimo : normal
  const inicio = fromKey(desde)
  const out: string[] = []
  for (let i = 0; i < 400; i++) {
    const corte = corteEn(c, inicio.getFullYear(), inicio.getMonth() + i)
    if (!corte) return []
    const k = toKey(corte)
    if (k > hoy) break
    if (k >= desde) out.push(k)
  }
  // Normalmente son 3 o 4. Con planes MSI largos se mira más atrás, hasta 40
  // cortes, para que un plan de 24 meses no se salga de la ventana.
  return out.slice(-40)
}

/** Desde qué fecha (exclusiva) hay que traer movimientos de estas tarjetas, o null si ninguna tiene corte. */
export function ventanaDeMovimientos(
  tarjetas: (CicloTarjeta & { id?: string })[],
  hoy: string,
  desdePorTarjeta?: Readonly<Record<string, string>>,
): string | null {
  let min: string | null = null
  for (const t of tarjetas) {
    if (t.type !== 'credit') continue
    const cortes = cortesParaEstados(t, hoy, t.id ? desdePorTarjeta?.[t.id] : null)
    if (cortes.length && (min == null || cortes[0] < min)) min = cortes[0]
  }
  return min
}

/**
 * ¿El capital de esta mensualidad seguía en el saldo de la tarjeta en el corte
 * `c`? Sí, salvo:
 *   · las que venían pagadas de antes de registrar el plan (origen «anterior»):
 *     el cargo sólo incluyó lo que faltaba;
 *   · las marcadas pagadas a mano ese día o antes (un plan liquidado, un
 *     adelanto): ese pago ya bajó el saldo, y restarlas otra vez dejaba el pago
 *     para no generar intereses por debajo de lo real — o en cero, sin aviso.
 * Una marcada después del corte sí estaba en el saldo en ese corte.
 */
function enSaldoEn(m: MesMsi, c: string): boolean {
  if (m.origen === 'anterior') return false
  if (m.origen === 'manual' && m.estado === 'pagada' && m.marcadaEl != null && m.marcadaEl <= c) return false
  return true
}

/** Mensualidades de esta tarjeta que en el corte `c` todavía no se cobraban. */
function msiNoFacturadoEn(planes: PlanEdc[], c: string): number {
  let total = 0
  for (const p of planes) {
    if (p.enSaldoDesde > c) continue // su capital aún no estaba en el saldo
    for (const m of p.cal.meses) {
      if (m.corte && m.corte > c && enSaldoEn(m, c)) total += m.monto
    }
  }
  return r2(total)
}

function msiDelCorteEn(planes: PlanEdc[], c: string): number {
  let total = 0
  for (const p of planes) {
    if (p.enSaldoDesde > c) continue
    for (const m of p.cal.meses) if (m.corte === c && enSaldoEn(m, c)) total += m.monto
  }
  return r2(total)
}

/**
 * Cuánto de un abono paga este estado de cuenta. Casi siempre, todo. La
 * excepción es «Liquidar» con «Restar del saldo»: ese ajuste lleva el plan
 * (`installment_id`) y paga sus mensualidades, la mayoría futuras, que no están
 * en este estado. Contarlo completo cubría las mensualidades de otros planes.
 * Aquí sólo cuenta lo de ese plan que ya estaba en este corte o antes y que la
 * liquidación marcó pagado.
 */
function abonoAplicable(m: MovEdc, c: string, planes: PlanEdc[]): number {
  const monto = -num(m.amount)
  if (!m.installment_id || m.type === 'installment' || m.type === 'transfer') return monto
  const plan = planes.find((p) => p.id === m.installment_id)
  if (!plan) return monto
  // Sin marcas a mano (sin la migración 036 «Liquidar» sólo mueve el
  // contador): no se sabe qué pagó, así que cuenta completo, como antes.
  if (!plan.cal.meses.some((x) => x.origen === 'manual')) return monto
  const fecha = m.date.slice(0, 10)
  const enEste = plan.cal.meses
    .filter(
      (x) =>
        x.corte != null && x.corte <= c && x.origen === 'manual' && x.estado === 'pagada' && x.marcadaEl != null && x.marcadaEl >= fecha,
    )
    .reduce((s, x) => s + x.monto, 0)
  return Math.min(monto, enEste)
}

function siguienteCorte(c: CicloTarjeta, hoy: string): string | null {
  const h = fromKey(hoy)
  for (let i = 0; i < 3; i++) {
    const corte = corteEn(c, h.getFullYear(), h.getMonth() + i)
    if (!corte) return null
    const k = toKey(corte)
    if (k > hoy) return k
  }
  return null
}

export function estadosDeCuenta(i: {
  tarjetas: TarjetaEdc[]
  movs: MovEdc[]
  planes: PlanEdc[]
  correcciones: CorreccionEdc[]
  hoy: string
  /** Hasta dónde mirar por tarjeta (la compra MSI activa más vieja); ver `cortesParaEstados`. */
  desdePorTarjeta?: Readonly<Record<string, string>>
}): Record<string, EstadosTarjeta> {
  const out: Record<string, EstadosTarjeta> = {}
  for (const t of i.tarjetas) {
    if (t.type !== 'credit') continue
    const cortes = cortesParaEstados(t, i.hoy, i.desdePorTarjeta?.[t.id])
    if (corteEn(t, 2000, 0) == null) {
      out[t.id] = { accountId: t.id, sinCorte: true, estados: [], proximo: null, ultimo: null, siguiente: null }
      continue
    }
    const saldo = num(t.balance)
    const movs = i.movs.filter((m) => m.account_id === t.id)
    const planes = i.planes.filter((p) => p.account_id === t.id)
    const alta = diaLocal(t.created_at)
    const pct = numONulo(t.min_payment_pct) ?? 1.5
    const limite = num(t.credit_limit)

    const vencimientos = cortes.map((c) => venceDelCorte(t, fromKey(c)))
    // Lo propio de cada corte, para el libro de arrastre de abajo.
    const propios: { msiExigible: number; minRev: number }[] = []
    const estados: EstadoDeCuenta[] = cortes.map((c, idx) => {
      const despues = movs.filter((m) => m.date.slice(0, 10) > c)
      const saldoAlCorte = r2(saldo - despues.reduce((s, m) => s + num(m.amount), 0))
      const msiNoFacturado = msiNoFacturadoEn(planes, c)
      const msiDelCorte = msiDelCorteEn(planes, c)
      const pngiCalculado = r2(Math.max(0, saldoAlCorte - msiNoFacturado))
      const corr = i.correcciones.find((x) => x.account_id === t.id && String(x.cut_date).slice(0, 10) === c)
      const pngiBanco = numONulo(corr?.no_interest_amount)
      const pngi = pngiBanco ?? pngiCalculado
      const abonos = despues.filter((m) => num(m.amount) < 0)
      const pagado = r2(abonos.reduce((s, m) => s + abonoAplicable(m, c, planes), 0))
      const siguienteCorteDeLaLista = cortes[idx + 1]
      const pagadoAntesDelSiguiente = siguienteCorteDeLaLista
        ? r2(
            abonos
              .filter((m) => m.date.slice(0, 10) <= siguienteCorteDeLaLista)
              .reduce((s, m) => s + abonoAplicable(m, c, planes), 0),
          )
        : pagado
      const falta = r2(Math.max(0, pngi - pagado))

      const msiExigible = Math.min(msiDelCorte, pngi)
      const revolvente = Math.max(0, pngi - msiExigible)
      // Banxico: el mayor entre el % del revolvente y el 1.25% del límite, más
      // las mensualidades de ese corte. Nunca más de lo que se debe.
      const minRev = revolvente > EPS ? Math.min(revolvente, Math.max((revolvente * pct) / 100, limite * 0.0125)) : 0
      const minimoBanco = numONulo(corr?.min_amount)
      propios[idx] = { msiExigible, minRev }

      const compras = r2(despues.filter((m) => num(m.amount) > 0).reduce((s, m) => s + num(m.amount), 0))
      const ajustesAlAlza = r2(
        despues.filter((m) => m.type === 'adjustment' && num(m.amount) > 0).reduce((s, m) => s + num(m.amount), 0),
      )

      const { vence: venceDate, estimado } = vencimientos[idx]
      const vence = toKey(venceDate)
      const estado: EstadoEdc =
        pngi <= EPS ? 'sin-saldo' : falta <= EPS ? 'pagado' : i.hoy <= vence ? 'pendiente' : 'vencido'
      // Si después de su fecha límite ya hubo otro corte, su deuda vive en ese.
      const absorbido = cortes.some((c2) => c2 > vence && c2 <= i.hoy)

      let aproximado: EstadoDeCuenta['aproximado'] = null
      if (alta && alta > c) aproximado = 'alta'
      else if (msiNoFacturado > saldoAlCorte + EPS) aproximado = 'msi-sin-respaldo'

      return {
        accountId: t.id,
        corte: c,
        vence,
        venceEstimado: estimado,
        saldoAlCorte,
        msiNoFacturado,
        msiDelCorte,
        pngiCalculado,
        pngi: r2(pngi),
        corregido: pngiBanco != null,
        abonos,
        pagado,
        pagadoAntesDelSiguiente,
        falta,
        // `minimo`, `minimoFalta` y los arrastres los llena el libro de abajo.
        minimo: 0,
        minimoBanco,
        minimoFalta: 0,
        arrastreMsi: 0,
        arrastreMinimo: 0,
        compras,
        ajustesAlAlza,
        estado,
        absorbido,
        aproximado,
      }
    })

    // El libro: del corte más viejo al más nuevo. Lo pagado entre un corte y el
    // siguiente se aplica primero a lo que se debía; lo que no alcanzó pasa al
    // siguiente. El banco suma el mínimo vencido al mínimo nuevo, y las
    // mensualidades MSI no cubiertas siguen debiéndose.
    let arrastreMsi = 0
    let arrastreMinimo = 0
    for (let k = 0; k < estados.length; k++) {
      const e = estados[k]
      const { msiExigible, minRev } = propios[k]
      e.arrastreMsi = r2(Math.min(e.pngi, arrastreMsi))
      e.arrastreMinimo = r2(Math.min(e.pngi, arrastreMinimo))
      e.minimo = r2(e.minimoBanco ?? Math.min(e.pngi, minRev + msiExigible + e.arrastreMinimo))
      e.minimoFalta = r2(Math.max(0, e.minimo - e.pagado))
      const deudaMsi = Math.min(e.pngi, msiExigible + e.arrastreMsi)
      arrastreMsi = Math.max(0, deudaMsi - e.pagadoAntesDelSiguiente)
      arrastreMinimo = Math.max(0, e.minimo - e.pagadoAntesDelSiguiente)
      // Un estado aproximado (de antes de dar de alta la tarjeta) no sabe qué
      // se debía: no se arrastra nada de él. `coberturaMsi` tampoco opina del
      // que le sigue.
      if (e.aproximado) {
        arrastreMsi = 0
        arrastreMinimo = 0
      }
    }

    const porVence = [...estados].sort((a, b) => a.vence.localeCompare(b.vence))
    const proximo = porVence.find((e) => !e.absorbido && e.falta > EPS && e.estado !== 'sin-saldo') ?? null
    const ultimo = estados[estados.length - 1] ?? null

    let siguiente: EstadosTarjeta['siguiente'] = null
    const sc = siguienteCorte(t, i.hoy)
    if (sc) {
      const abiertos = estados.filter((e) => !e.absorbido && e.vence >= i.hoy)
      const pendienteAbierto = abiertos.reduce((s, e) => Math.max(s, e.falta), 0)
      const estimado = r2(Math.max(0, saldo - msiNoFacturadoEn(planes, sc) - pendienteAbierto))
      siguiente = { corte: sc, vence: toKey(venceDelCorte(t, fromKey(sc)).vence), estimado }
    }

    out[t.id] = { accountId: t.id, sinCorte: false, estados, proximo, ultimo, siguiente }
  }
  return out
}

export interface PagoProyectado {
  corte: string
  vence: string
  monto: number
  estimado: boolean
  estado: EstadoEdc | 'estimado'
}

/**
 * Lo que saldrá de tu efectivo en cada fecha de pago de esta tarjeta, hasta
 * `hasta`. Cada pago descuenta lo que ya se asumió en los anteriores: el estado
 * de un corte ya incluye lo que quedó sin pagar del anterior, y sin esto la
 * proyección lo restaba dos veces. Lo ya pagado sale en 0.
 */
export function pagosProyectados(
  e: EstadosTarjeta,
  t: TarjetaEdc,
  planes: PlanEdc[],
  hasta: string,
  hoy: string,
): PagoProyectado[] {
  if (e.sinCorte) return []
  const out: PagoProyectado[] = []
  let asumido = 0
  const abiertos = e.estados.filter((s) => !s.absorbido && s.vence >= hoy).sort((a, b) => a.vence.localeCompare(b.vence))
  for (const s of abiertos) {
    const monto = r2(Math.max(0, s.falta - asumido))
    asumido += monto
    out.push({ corte: s.corte, vence: s.vence, monto, estimado: !s.corregido, estado: s.estado })
  }
  // También los ya vencidos de este rango, para que el calendario los muestre
  // (con su monto pendiente, sin sumarlo a lo asumido: ya está en el saldo).
  for (const s of e.estados) {
    if (s.absorbido || s.vence >= hoy) continue
    out.push({ corte: s.corte, vence: s.vence, monto: s.falta, estimado: !s.corregido, estado: s.estado })
  }
  const saldo = num(t.balance)
  const delTarjeta = planes.filter((p) => p.account_id === t.id)
  let c = siguienteCorte(t, hoy)
  for (let i = 0; c && i < 24; i++) {
    const vence = toKey(venceDelCorte(t, fromKey(c)).vence)
    if (vence > hasta) break
    const monto = r2(Math.max(0, saldo - msiNoFacturadoEn(delTarjeta, c) - asumido))
    asumido += monto
    out.push({ corte: c, vence, monto, estimado: true, estado: 'estimado' })
    c = siguienteCorte(t, c)
  }
  return out.sort((a, b) => a.vence.localeCompare(b.vence))
}

/**
 * ¿Ya está registrada esta compra en la tarjeta? Al registrar algo «a meses»,
 * si ya hay un gasto parecido (±$1, ±3 días) conviene convertirlo en vez de
 * cargarlo otra vez: así se duplicaba la compra.
 */
export function compraParecida(movs: MovEdc[], q: { accountId: string; total: number; fecha: string }): MovEdc | null {
  let mejor: MovEdc | null = null
  let mejorDist = Infinity
  for (const m of movs) {
    if (m.account_id !== q.accountId) continue
    if (m.type !== 'transaction' && m.type !== 'sync') continue
    if (m.installment_id) continue
    const monto = num(m.amount)
    if (monto <= 0 || Math.abs(monto - q.total) > 1) continue
    const d = Math.abs(dias(m.date.slice(0, 10), q.fecha))
    if (d > 3) continue
    if (d < mejorDist) {
      mejor = m
      mejorDist = d
    }
  }
  return mejor
}
