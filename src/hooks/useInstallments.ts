import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useHoy } from '@/hooks/useHoy'
import { useTableChannel } from '@/hooks/useTableChannel'
import { esTablaFaltante, tieneEsquemaMsi } from '@/lib/esquema'
import { toKey } from '@/lib/localDate'
import type { CicloTarjeta } from '@/lib/cardCycle'
import {
  calendarioMsi,
  conMarca,
  copiaContador,
  liquidarMarcas,
  marcasGuardables,
  nuevoCargo,
  registradoEl,
  vivo,
  type CargoMsi,
  type InstallmentVivo,
} from '@/lib/msi'
import {
  estadosDeCuenta,
  planEdc,
  ventanaDeMovimientos,
  type CorreccionEdc,
  type EstadosTarjeta,
  type MovEdc,
  type PlanEdc,
  type TarjetaEdc,
} from '@/lib/estadoDeCuenta'
import type { Account, Installment } from '@/types'

export interface NewInstallment {
  name: string
  total_amount: number
  monthly_amount: number
  months_total: number
  account_id?: string | null
  /** Fecha de compra. Con ella y el corte de la tarjeta se sabe en qué mensualidad va. */
  start_date?: string
  is_zero_interest?: boolean
  /** Promos «empieza a pagar en N meses». */
  billing_offset?: number
  /**
   * Transient, never stored: put what is still owed on the linked card so
   * `accounts.balance` really contains it. Ignored without an `account_id`.
   */
  charge_to_card?: boolean
}

export type InstallmentPatch = Partial<Omit<NewInstallment, 'charge_to_card'>>

/** La fila tal como llega, con la tarjeta y el cargo embebidos. */
type Fila = Installment & {
  cuenta?: CicloTarjeta | null
  vinculados?: (CargoMsi & { type?: string })[] | null
}

const EMPTY: InstallmentVivo[] = []
const SIN_ESTADOS: Record<string, EstadosTarjeta> = {}

/** Lo que hace falta para el estado de cuenta de cada tarjeta. */
interface FotoTarjetas {
  tarjetas: TarjetaEdc[]
  movs: MovEdc[]
  correcciones: CorreccionEdc[]
  conCorrecciones: boolean
  listo: boolean
}
const FOTO_VACIA: FotoTarjetas = { tarjetas: [], movs: [], correcciones: [], conCorrecciones: false, listo: false }

/** El ciclo de una tarjeta, para saber qué mensualidades ya vencieron. */
async function cicloDeCuenta(accountId: string | null | undefined): Promise<CicloTarjeta | null> {
  if (!accountId) return null
  const { data } = await supabase
    .from('accounts')
    .select('type, cut_day, payment_due_day, payment_grace_days')
    .eq('id', accountId)
    .maybeSingle()
  return (data as CicloTarjeta | null) ?? null
}
const CON_EMBEBIDOS =
  '*, cuenta:accounts(type, cut_day, payment_due_day, payment_grace_days), vinculados:transactions(id, amount, account_id, date, type)'

function cargoDe(f: Fila): CargoMsi | null {
  const c = (f.vinculados ?? []).find((t) => t.type === 'installment') ?? null
  return c ? { id: c.id, amount: Number(c.amount), account_id: c.account_id, date: c.date } : null
}

function cicloDe(f: Fila): CicloTarjeta | null {
  return f.account_id && f.cuenta ? f.cuenta : null
}

/** Sólo las columnas de la tabla, sin lo embebido. */
function sinEmbebidos(f: Fila): Installment {
  const { cuenta: _c, vinculados: _v, ...resto } = f
  void _c
  void _v
  return resto
}

/**
 * Planes a meses con su calendario.
 *
 * Devuelve cada plan «vivo»: con `months_paid` y `status` calculados por fechas
 * (ver src/lib/msi.ts), su tarjeta y el cargo que lo respalda. «Mensualidad 4
 * de 12» avanza sola con `useHoy`, y en tiempo real escucha planes y tarjetas
 * (cambiar el día de corte cambia las fechas).
 */
export function useInstallments() {
  const { user } = useAuth()
  const hoy = useHoy()
  const [filas, setFilas] = useState<Fila[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [foto, setFoto] = useState<FotoTarjetas>(FOTO_VACIA)

  /**
   * Las tarjetas, sus movimientos desde el corte más viejo que importa y las
   * correcciones del banco: con eso se calcula el estado de cuenta. Los ciclos
   * de corte salen de aquí también, así un fallo de la consulta de los planes
   * ya no deja a los MSI sin fechas.
   */
  const fetchTarjetas = useCallback(async () => {
    if (!user) return
    const { data: cuentas, error: errCuentas } = await supabase.from('accounts').select('*').eq('type', 'credit')
    if (errCuentas) {
      setFoto((f) => ({ ...f, listo: true }))
      return
    }
    const tarjetas = ((cuentas ?? []) as Account[]).filter((a) => a.type === 'credit')
    const desde = ventanaDeMovimientos(tarjetas, toKey(new Date()))
    const ids = tarjetas.map((t) => t.id)
    if (!desde || ids.length === 0) {
      setFoto({ tarjetas, movs: [], correcciones: [], conCorrecciones: false, listo: true })
      return
    }
    const [movsRes, corrRes] = await Promise.all([
      supabase.from('transactions').select('*').in('account_id', ids).gt('date', desde),
      supabase.from('card_statements').select('*').in('account_id', ids),
    ])
    const idsSet = new Set(ids)
    setFoto({
      tarjetas,
      // Se vuelve a filtrar aquí: el cálculo no debe depender de que el filtro
      // del servidor haya llegado intacto.
      movs: ((movsRes.data ?? []) as MovEdc[]).filter((m) => idsSet.has(m.account_id) && m.date > desde),
      correcciones: corrRes.error ? [] : ((corrRes.data ?? []) as CorreccionEdc[]),
      conCorrecciones: !corrRes.error || !esTablaFaltante(corrRes.error),
      listo: true,
    })
  }, [user])

  const fetchInstallments = useCallback(async () => {
    if (!user) return
    let res = await supabase
      .from('installments')
      .select(CON_EMBEBIDOS)
      .order('created_at', { ascending: false })
    // Si la consulta con tarjeta y cargo falla (caché de esquema, permisos), los
    // planes se muestran igual, sin fechas de corte.
    if (res.error) {
      res = await supabase.from('installments').select('*').order('created_at', { ascending: false })
    }
    if (res.error) setError(res.error)
    else {
      setError(null)
      setFilas((res.data ?? []) as Fila[])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchInstallments()
  }, [user, fetchInstallments])

  // La ventana de movimientos depende del día: se vuelve a pedir al cambiar.
  useEffect(() => {
    if (!user) return
    void fetchTarjetas()
  }, [user, fetchTarjetas, hoy])

  // Un pago o una compra nueva llegan en ráfagas (las dos partes de un pago):
  // se juntan en una sola recarga.
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (espera.current) clearTimeout(espera.current)
  }, [])
  const recargarTarjetas = useCallback(() => {
    if (espera.current) clearTimeout(espera.current)
    espera.current = setTimeout(() => void fetchTarjetas(), 250)
  }, [fetchTarjetas])

  useTableChannel(
    'estados',
    user ? [{ table: 'transactions', filter: `user_id=eq.${user.id}` }] : null,
    recargarTarjetas,
  )
  // La tabla de correcciones sólo existe con la migración 038; escuchar una
  // tabla inexistente puede tumbar el canal entero.
  useTableChannel(
    'correcciones',
    user && foto.conCorrecciones ? [{ table: 'card_statements', filter: `user_id=eq.${user.id}` }] : null,
    recargarTarjetas,
  )

  useTableChannel(
    'installments',
    user
      ? [
          { table: 'installments', filter: `user_id=eq.${user.id}` },
          // Un cargo nuevo o borrado mueve el saldo de la tarjeta; cambiar el
          // corte mueve las fechas. Las dos cosas llegan por aquí.
          { table: 'accounts', filter: `user_id=eq.${user.id}` },
        ]
      : null,
    () => {
      void fetchInstallments()
      recargarTarjetas()
    },
  )

  const { data, estados, planes } = useMemo(() => {
    const porId = new Map(foto.tarjetas.map((t) => [t.id, t]))
    // El ciclo de la tarjeta: de la foto (siempre fresca) o del plan embebido.
    const ciclo = (f: Fila): CicloTarjeta | null =>
      (f.account_id ? (porId.get(f.account_id) as CicloTarjeta | undefined) : undefined) ?? cicloDe(f)
    const cargo = (f: Fila): CargoMsi | null => {
      const embebido = cargoDe(f)
      if (embebido) return embebido
      const m = foto.movs.find((x) => x.installment_id === f.id && x.type === 'installment')
      return m ? { id: m.id, amount: Number(m.amount), account_id: m.account_id, date: m.date } : null
    }
    const planes: PlanEdc[] = filas.map((f) => planEdc(sinEmbebidos(f), ciclo(f), cargo(f), hoy))
    const estados = estadosDeCuenta({
      tarjetas: foto.tarjetas,
      movs: foto.movs,
      planes,
      correcciones: foto.correcciones,
      hoy,
    })
    const data = filas.map((f) => vivo(sinEmbebidos(f), ciclo(f), hoy, cargo(f)))
    return { data, estados, planes }
  }, [filas, foto, hoy])

  function filaDe(id: string) {
    return filas.find((f) => f.id === id)
  }

  function parchar(id: string, cambios: Partial<Fila>) {
    setFilas((cur) => cur.map((f) => (f.id === id ? { ...f, ...cambios } : f)))
  }

  async function create(inst: NewInstallment): Promise<void> {
    if (!user) throw new Error('Not authenticated')
    const { charge_to_card: chargeToCard, billing_offset, ...row } = inst
    const migrado = await tieneEsquemaMsi()
    const ahora = new Date().toISOString()
    const hoyLocal = toKey(new Date())
    const startDate = row.start_date || hoyLocal
    const base: Installment = {
      id: crypto.randomUUID(),
      user_id: user.id,
      account_id: row.account_id ?? null,
      name: row.name,
      total_amount: row.total_amount,
      monthly_amount: row.monthly_amount,
      months_total: row.months_total,
      months_paid: 0,
      start_date: startDate,
      status: 'active',
      is_zero_interest: row.is_zero_interest ?? true,
      created_at: ahora,
      updated_at: ahora,
      month_status: migrado ? { _v: 2 } : undefined,
      billing_offset: billing_offset ?? 0,
    }
    // La tarjeta (si ya la tenemos cargada) para saber qué ya venció.
    const ciclo = await cicloDeCuenta(row.account_id)
    const cal = calendarioMsi(base, ciclo, hoyLocal)
    setFilas((prev) => [{ ...base, ...copiaContador(cal) }, ...prev])

    // The plan is the source of truth and the charge points back at it, so the
    // plan has to exist first — the foreign key leaves no other order.
    const { data: inserted, error: err } = await supabase
      .from('installments')
      .insert({
        ...row,
        user_id: user.id,
        start_date: startDate,
        is_zero_interest: row.is_zero_interest ?? true,
        ...copiaContador(cal),
        ...(migrado ? { month_status: { _v: 2 }, billing_offset: billing_offset ?? 0 } : {}),
      })
      .select('id')
      .single()

    if (err || !inserted) {
      setFilas((prev) => prev.filter((i) => i.id !== base.id))
      throw err ?? new Error('No se pudo guardar el plan')
    }

    if (chargeToCard && row.account_id) {
      // Lo que falta por pagar: sin pagos es el total exacto (la última
      // mensualidad absorbe el redondeo). Si la compra es vieja, lo que ya
      // venció se pagó con estados de cuenta que ya estaban en el saldo.
      const amount = cal.restante
      if (amount > 0) {
        const { error: chargeErr } = await supabase.from('transactions').insert({
          user_id: user.id,
          account_id: row.account_id,
          amount,
          description: row.name,
          date: startDate,
          type: 'installment',
          installment_id: inserted.id,
        })
        // A plan whose charge never landed would leave the card under-reporting
        // exactly the amount we were trying to make visible. Undo it instead.
        if (chargeErr) {
          await supabase.from('installments').delete().eq('id', inserted.id)
          setFilas((prev) => prev.filter((i) => i.id !== base.id))
          throw chargeErr
        }
      }
    }
    await fetchInstallments()
  }

  /**
   * Editar el plan. El cargo a la tarjeta se ajusta por DIFERENCIA (nunca resta
   * dos veces lo ya pagado), se mueve a la tarjeta nueva y cambia de fecha con
   * la compra. Devuelve el cargo antes y después, para avisarlo.
   */
  async function update(id: string, patch: InstallmentPatch): Promise<{ antes: number | null; despues: number | null }> {
    const prev = filaDe(id)
    if (!prev) return { antes: null, despues: null }
    const migrado = await tieneEsquemaMsi()
    const ahora = new Date().toISOString()
    const hoyLocal = toKey(new Date())
    const plano = sinEmbebidos(prev)
    const nuevo: Installment = { ...plano, ...patch, updated_at: ahora } as Installment
    // Recortar el plazo deja marcas de meses que ya no existen.
    const marcas = migrado ? marcasGuardables(plano, patch.months_total ?? undefined) : null
    if (marcas) nuevo.month_status = marcas
    const cicloAntes = cicloDe(prev)
    const cuentaCambia = patch.account_id !== undefined && patch.account_id !== prev.account_id
    const cicloDespues = cuentaCambia ? await cicloDeCuenta(patch.account_id) : cicloAntes
    const cal = calendarioMsi(nuevo, cicloDespues, hoyLocal)

    const { billing_offset, ...columnas } = patch
    parchar(id, { ...patch, updated_at: ahora, ...copiaContador(cal), ...(marcas ? { month_status: marcas } : {}) })
    const { error: err } = await supabase
      .from('installments')
      .update({
        ...columnas,
        ...copiaContador(cal),
        updated_at: ahora,
        ...(migrado ? { ...(billing_offset != null ? { billing_offset } : {}), ...(marcas ? { month_status: marcas } : {}) } : {}),
      })
      .eq('id', id)
    if (err) {
      setFilas((cur) => cur.map((f) => (f.id === id ? prev : f)))
      throw err
    }

    const cargo = cargoDe(prev)
    if (!cargo) {
      await fetchInstallments()
      return { antes: null, despues: null }
    }
    const reg = registradoEl(plano, hoyLocal)
    const cuentaNueva = cuentaCambia ? patch.account_id ?? null : prev.account_id
    const monto = nuevoCargo(cargo.amount, [plano, cicloAntes], [nuevo, cicloDespues], reg)

    try {
      if (!cuentaNueva || monto <= 0) {
        // «Sin tarjeta»: el cargo se quita (el formulario lo avisa antes).
        const { error: e } = await supabase.from('transactions').delete().eq('id', cargo.id)
        if (e) throw e
      } else if (
        Math.abs(monto - cargo.amount) < 0.005 &&
        cuentaNueva === cargo.account_id &&
        nuevo.start_date === cargo.date &&
        nuevo.name === prev.name
      ) {
        // Nada que mover.
      } else if (migrado) {
        // Con la migración 036 el trigger recalcula el saldo al editar.
        const { error: e } = await supabase
          .from('transactions')
          .update({ amount: monto, account_id: cuentaNueva, date: nuevo.start_date, description: nuevo.name })
          .eq('id', cargo.id)
        if (e) throw e
      } else {
        // Sin ella, editar no mueve saldos: se borra y se vuelve a crear.
        // Primero el nuevo: si falla, el viejo sigue ahí y el saldo no se pierde.
        const { error: e2 } = await supabase.from('transactions').insert({
          user_id: prev.user_id,
          account_id: cuentaNueva,
          amount: monto,
          description: nuevo.name,
          date: nuevo.start_date,
          type: 'installment',
          installment_id: id,
        })
        if (e2) throw e2
        const { error: e1 } = await supabase.from('transactions').delete().eq('id', cargo.id)
        if (e1) throw e1
      }
    } catch (e) {
      // El plan quedó editado pero el cargo no: se regresa el plan a como estaba
      // para que tarjeta y plan no cuenten historias distintas.
      await supabase
        .from('installments')
        .update({
          name: prev.name,
          total_amount: prev.total_amount,
          monthly_amount: prev.monthly_amount,
          months_total: prev.months_total,
          account_id: prev.account_id,
          start_date: prev.start_date,
          is_zero_interest: prev.is_zero_interest,
          months_paid: prev.months_paid,
          status: prev.status,
          ...(migrado ? { month_status: prev.month_status ?? { _v: 2 }, billing_offset: prev.billing_offset ?? 0 } : {}),
        })
        .eq('id', id)
      setFilas((cur) => cur.map((f) => (f.id === id ? prev : f)))
      throw e
    }
    await fetchInstallments()
    return { antes: cargo.amount, despues: cuentaNueva && monto > 0 ? monto : 0 }
  }

  /** Marcar una mensualidad pagada, no pagada, o regresarla a lo que digan las fechas. */
  async function marcarMes(id: string, n: number, e: 'paid' | 'unpaid' | 'auto'): Promise<void> {
    const prev = filaDe(id)
    if (!prev) return
    const migrado = await tieneEsquemaMsi()
    const hoyLocal = toKey(new Date())
    const plano = sinEmbebidos(prev)

    if (!migrado) {
      // Sin la migración sólo existe el contador: se mueve si la marca es la
      // siguiente (o la última, para deshacer).
      const actual = Number(plano.months_paid) || 0
      const pagados = e === 'paid' && n === actual + 1 ? actual + 1 : e !== 'paid' && n === actual ? actual - 1 : null
      if (pagados == null) throw new Error('Corre la migración 036 para marcar meses sueltos')
      const status = pagados >= plano.months_total ? 'paid' : 'active'
      parchar(id, { months_paid: pagados, status })
      const { error: err } = await supabase.from('installments').update({ months_paid: pagados, status }).eq('id', id)
      if (err) {
        setFilas((cur) => cur.map((f) => (f.id === id ? prev : f)))
        throw err
      }
      return
    }

    const month_status = conMarca(plano, n, e, hoyLocal)
    const cal = calendarioMsi({ ...plano, month_status }, cicloDe(prev), hoyLocal)
    const cambios = { month_status, ...copiaContador(cal), updated_at: new Date().toISOString() }
    parchar(id, cambios)
    const { error: err } = await supabase.from('installments').update(cambios).eq('id', id)
    if (err) {
      setFilas((cur) => cur.map((f) => (f.id === id ? prev : f)))
      throw err
    }
  }

  /** «Liquidar el resto»: todas las mensualidades que faltan quedan pagadas hoy. */
  async function liquidar(id: string): Promise<void> {
    const prev = filaDe(id)
    if (!prev) return
    const migrado = await tieneEsquemaMsi()
    const hoyLocal = toKey(new Date())
    const plano = sinEmbebidos(prev)
    const cambios = migrado
      ? (() => {
          const month_status = liquidarMarcas(plano, cicloDe(prev), hoyLocal)
          return { month_status, months_paid: Number(plano.months_total), status: 'paid' as const }
        })()
      : { months_paid: Number(plano.months_total), status: 'paid' as const }
    parchar(id, cambios)
    const { error: err } = await supabase
      .from('installments')
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (err) {
      setFilas((cur) => cur.map((f) => (f.id === id ? prev : f)))
      throw err
    }
  }

  /**
   * Borrar el plan. Por omisión el cargo se quita sólo si no se ha pagado nada:
   * con pagos hechos, esos pagos ya bajaron el saldo, y quitar el cargo
   * completo lo dejaba por debajo de lo real.
   */
  async function remove(id: string, opciones: { quitarCargo: boolean }): Promise<void> {
    const prev = filaDe(id)
    setFilas((cur) => cur.filter((i) => i.id !== id))
    const cargo = prev ? cargoDe(prev) : null
    // El cargo va primero: la llave foránea es `on delete set null`.
    if (cargo && opciones.quitarCargo) {
      const { error: chargeErr } = await supabase.from('transactions').delete().eq('id', cargo.id)
      if (chargeErr) {
        if (prev) setFilas((cur) => [prev, ...cur])
        throw chargeErr
      }
    }
    const { error: err } = await supabase.from('installments').delete().eq('id', id)
    if (err) {
      if (prev) setFilas((cur) => [prev, ...cur])
      throw err
    }
  }

  const active = useMemo(() => data.filter((i) => i.status === 'active'), [data])

  return {
    data: user ? data : EMPTY,
    active: user ? active : EMPTY,
    /** Estado de cuenta por tarjeta (id → estados, próximo pago, siguiente corte). */
    estados: user ? estados : SIN_ESTADOS,
    /** Planes vistos desde su tarjeta, para proyectar pagos. */
    planesTarjeta: planes,
    tarjetas: foto.tarjetas,
    movsTarjetas: foto.movs,
    estadosListos: foto.listo,
    conCorrecciones: foto.conCorrecciones,
    recargarTarjetas: fetchTarjetas,
    loading: user ? loading : false,
    error,
    create,
    update,
    marcarMes,
    liquidar,
    remove,
  }
}
