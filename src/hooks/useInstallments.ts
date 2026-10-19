import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useHoy } from '@/hooks/useHoy'
import { useTableChannel } from '@/hooks/useTableChannel'
import { alCambiarTarjetas, avisarCambioEnTarjetas } from '@/lib/avisoTarjetas'
import { coberturaDe, coberturaMsi } from '@/lib/coberturaMsi'
import { esTablaFaltante, tieneEsquemaMsi } from '@/lib/esquema'
import { addDays, dayInMonth, fromKey, toKey } from '@/lib/localDate'
import type { CicloTarjeta } from '@/lib/cardCycle'
import {
  calendarioMsi,
  conMarca,
  copiaContador,
  esAdoptado,
  fechaDeCompra,
  marcasEfectivas,
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
  /**
   * Transient: un gasto de tarjeta ya registrado que pasa a ser el cargo del
   * plan («Convertir a meses»). No se carga nada nuevo: el saldo no cambia.
   */
  adopt_tx_id?: string
}

export type InstallmentPatch = Partial<Omit<NewInstallment, 'charge_to_card' | 'adopt_tx_id'>>

/** La fila tal como llega, con la tarjeta y el cargo embebidos. */
type Fila = Installment & {
  cuenta?: CicloTarjeta | null
  vinculados?: (CargoMsi & { type?: string; created_at?: string | null; source?: string | null })[] | null
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
  /**
   * No se pudieron traer los movimientos: sin ellos, el estado de cuenta diría
   * que no has pagado nada. Mejor no decir nada que una cifra falsa.
   */
  fallo: boolean
  /** La ventana con la que se trajeron los movimientos: los estados no van más atrás. */
  ventana: Record<string, string>
  /** La ventana pedida cuya carga falló (se conserva la foto anterior). */
  falloVentana: string | null
}
const FOTO_VACIA: FotoTarjetas = {
  tarjetas: [], movs: [], correcciones: [], conCorrecciones: false, listo: false, fallo: false, ventana: {}, falloVentana: null,
}

/** ¿La foto trae al menos la ventana pedida (cada tarjeta desde esa fecha o antes)? */
function cubreVentana(foto: Record<string, string>, pedida: Record<string, string>): boolean {
  return Object.entries(pedida).every(([id, desde]) => foto[id] != null && foto[id] <= desde)
}

/** Reintentos tras una carga fallida: 5, 15 y 45 s. */
const ESPERAS_REINTENTO = [5_000, 15_000, 45_000]

/** PostgREST corta en 1,000 filas: una tarjeta sincronizada las rebasa en la ventana. */
const PAGINA = 1000

async function movimientosDesde(ids: string[], desde: string): Promise<MovEdc[] | null> {
  const out: MovEdc[] = []
  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .in('account_id', ids)
      .gt('date', desde)
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(i * PAGINA, i * PAGINA + PAGINA - 1)
    if (error) return null
    const filas = (data ?? []) as MovEdc[]
    out.push(...filas)
    if (filas.length < PAGINA) return out
  }
  // 20 páginas llenas: hay más. Recortar en silencio dejaba fuera justo lo más
  // nuevo; mejor decir que no se pudo.
  return null
}

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
  '*, cuenta:accounts(type, cut_day, payment_due_day, payment_grace_days), vinculados:transactions(id, amount, account_id, date, type, created_at, source)'

function cargoDe(f: Fila): CargoMsi | null {
  const c = (f.vinculados ?? []).find((t) => t.type === 'installment') ?? null
  return c ? cargoDesde(c, f) : null
}

function cargoDesde(
  c: { id: string; amount: number | string; account_id: string; date: string; created_at?: string | null; source?: string | null },
  f: Pick<Installment, 'created_at'>,
): CargoMsi {
  return {
    id: c.id,
    amount: Number(c.amount),
    account_id: c.account_id,
    date: c.date,
    adoptado: esAdoptado(c, f),
    tipoOriginal: c.source === 'syncfy' ? 'sync' : 'transaction',
  }
}

function cicloDe(f: Fila): CicloTarjeta | null {
  return f.account_id && f.cuenta ? f.cuenta : null
}

/** Un plan liquidado que se «borró» y se guarda sólo para los estados de cuenta. */
function archivado(f: Installment): boolean {
  const ms = f.month_status as Record<string, unknown> | null | undefined
  return !!ms && ms._oculto === true
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
  // Hasta dónde mirar el estado de cuenta de cada tarjeta: la compra más vieja
  // de sus planes activos (un plan de 12 meses rebasa la ventana normal).
  // Un corte antes de la 1ª mensualidad: así cada corte del plan tiene un
  // estado anterior del que saber qué quedó sin pagar.
  // No se usa el `status` guardado (se escribe sólo con las fechas): un plan
  // sale de la cuenta sólo si TODAS sus mensualidades tienen marca «pagada».
  const desdePorTarjeta = useMemo(() => {
    const out: Record<string, string> = {}
    const hoyKey = toKey(new Date())
    // Un plan cuya última mensualidad venció hace más de ~13 meses ya no
    // sostiene la ventana: lo de entonces lo deciden las fechas.
    const limite = toKey(addDays(fromKey(hoyKey), -400))
    for (const f of filas) {
      if (!f.account_id) continue
      const marcas = marcasEfectivas(f)
      const M = Math.max(1, Math.round(Number(f.months_total) || 1))
      let todas = true
      for (let n = 1; n <= M; n++) if (marcas[n]?.s !== 'paid') todas = false
      if (todas) continue
      const compra = fromKey(fechaDeCompra(f, hoyKey))
      const offset = Math.max(0, Math.round(Number(f.billing_offset) || 0))
      // Última fecha límite, a lo más tarde: compra + plazo + promoción + 2 meses.
      const termina = toKey(dayInMonth(compra.getFullYear(), compra.getMonth() + M + offset + 2, compra.getDate()))
      if (termina < limite) continue
      const desde = toKey(addDays(compra, -35))
      if (!out[f.account_id] || desde < out[f.account_id]) out[f.account_id] = desde
    }
    return out
  }, [filas])
  // Como texto: la carga se repite sólo cuando la fecha cambia, no con cada plan.
  const claveVentana = JSON.stringify(desdePorTarjeta)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [foto, setFoto] = useState<FotoTarjetas>(FOTO_VACIA)

  /**
   * Las tarjetas, sus movimientos desde el corte más viejo que importa y las
   * correcciones del banco: con eso se calcula el estado de cuenta. Los ciclos
   * de corte salen de aquí también, así un fallo de la consulta de los planes
   * ya no deja a los MSI sin fechas.
   */
  // Gana la respuesta más nueva: una carga lenta con la ventana vieja no debe
  // pisar la que ya trajo la ventana ampliada.
  const pedidos = useRef(0)
  const reintentos = useRef(0)
  const reintento = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (reintento.current) clearTimeout(reintento.current)
  }, [])
  const fetchTarjetas = useCallback(async () => {
    if (!user) return
    const pedido = ++pedidos.current
    const vigente = () => pedido === pedidos.current
    // Un fallo conserva la foto anterior (si había una buena); sin ella, se
    // marca para no calcular con datos que faltan.
    const fallar = () => {
      if (!vigente()) return
      setFoto((f) =>
        f.listo && !f.fallo
          ? { ...f, falloVentana: claveVentana }
          : { ...FOTO_VACIA, listo: true, fallo: true, falloVentana: claveVentana },
      )
      // Una falla de red no debe dejar el estado de cuenta apagado para siempre.
      const n = reintentos.current++
      if (n < ESPERAS_REINTENTO.length) {
        if (reintento.current) clearTimeout(reintento.current)
        reintento.current = setTimeout(() => void fetchRef.current(), ESPERAS_REINTENTO[n])
      }
    }
    const { data: cuentas, error: errCuentas } = await supabase.from('accounts').select('*').eq('type', 'credit')
    if (errCuentas) return fallar()
    const tarjetas = ((cuentas ?? []) as Account[]).filter((a) => a.type === 'credit')
    const ventana = JSON.parse(claveVentana) as Record<string, string>
    const hoyKey = toKey(new Date())
    // Cada tarjeta con su propia ventana: un plan viejo en una no obliga a
    // traer años de movimientos de las demás.
    const porTarjeta = tarjetas
      .map((t) => ({ id: t.id, desde: ventanaDeMovimientos([t], hoyKey, ventana) }))
      .filter((x): x is { id: string; desde: string } => x.desde != null)
    const ids = tarjetas.map((t) => t.id)
    if (porTarjeta.length === 0) {
      if (vigente()) {
        reintentos.current = 0
        setFoto({ tarjetas, movs: [], correcciones: [], conCorrecciones: false, listo: true, fallo: false, ventana, falloVentana: null })
      }
      return
    }
    const [listas, corrRes] = await Promise.all([
      Promise.all(porTarjeta.map((x) => movimientosDesde([x.id], x.desde))),
      supabase.from('card_statements').select('*').in('account_id', ids),
    ])
    if (listas.some((l) => l == null)) return fallar()
    if (!vigente()) return
    reintentos.current = 0
    setFoto({
      tarjetas,
      // Se vuelve a filtrar aquí: el cálculo no debe depender de que el filtro
      // del servidor haya llegado intacto.
      movs: porTarjeta.flatMap((x, i) => (listas[i] ?? []).filter((m) => m.account_id === x.id && m.date > x.desde)),
      correcciones: corrRes.error ? [] : ((corrRes.data ?? []) as CorreccionEdc[]),
      conCorrecciones: !corrRes.error || !esTablaFaltante(corrRes.error),
      listo: true,
      fallo: false,
      ventana,
      falloVentana: null,
    })
  }, [user, claveVentana])

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
    // fetchTarjetas sólo cambia estado después de un await.
    void fetchTarjetas()
  }, [user, fetchTarjetas, hoy])

  // Un pago o una compra nueva llegan en ráfagas (las dos partes de un pago):
  // se juntan en una sola recarga.
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (espera.current) clearTimeout(espera.current)
  }, [])
  // El temporizador llama a la última versión (con la ventana vigente), no a la
  // que existía cuando se programó.
  const fetchRef = useRef(fetchTarjetas)
  useEffect(() => {
    fetchRef.current = fetchTarjetas
  }, [fetchTarjetas])
  const recargarTarjetas = useCallback(() => {
    if (espera.current) clearTimeout(espera.current)
    espera.current = setTimeout(() => void fetchRef.current(), 250)
  }, [])
  // Un pago o un borrado desde otra pantalla de esta pestaña. Los planes
  // también: un DELETE filtrado no siempre llega por tiempo real.
  useEffect(
    () =>
      alCambiarTarjetas(() => {
        recargarTarjetas()
        void fetchInstallments()
      }),
    [recargarTarjetas, fetchInstallments],
  )

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

  // El estado de cuenta resta los MSI que aún no se cobran: sin los planes
  // cargados (o si fallaron), pediría el saldo completo. Hasta tenerlos, nada.
  const estadosListos = foto.listo && !loading
  const fiables = estadosListos && !foto.fallo && !error
  // La cobertura necesita además la ventana completa: con la foto de la
  // ventana corta, una mensualidad vieja sin pagar se daría por pagada.
  const coberturaLista = fiables && cubreVentana(foto.ventana, JSON.parse(claveVentana) as Record<string, string>)

  const { data, estados, planes, coberturas } = useMemo(() => {
    const porId = new Map(foto.tarjetas.map((t) => [t.id, t]))
    // El ciclo de la tarjeta: de la foto (siempre fresca) o del plan embebido.
    const ciclo = (f: Fila): CicloTarjeta | null =>
      (f.account_id ? (porId.get(f.account_id) as CicloTarjeta | undefined) : undefined) ?? cicloDe(f)
    const cargo = (f: Fila): CargoMsi | null => {
      const embebido = cargoDe(f)
      if (embebido) return embebido
      const m = foto.movs.find((x) => x.installment_id === f.id && x.type === 'installment')
      return m ? cargoDesde(m, f) : null
    }
    const planes: PlanEdc[] = filas.map((f) => planEdc(sinEmbebidos(f), ciclo(f), cargo(f), hoy))
    const estados = estadosDeCuenta({
      tarjetas: foto.tarjetas,
      movs: foto.movs,
      planes,
      correcciones: foto.correcciones,
      // La de la foto, no la de los planes: sin los movimientos de más atrás,
      // un estado viejo diría que no pagaste.
      desdePorTarjeta: foto.ventana,
      hoy,
    })
    // Las mensualidades de tarjeta las cubren los pagos de cada estado de cuenta.
    // Sin un estado confiable, no se opina: decide la fecha.
    const coberturas = coberturaLista ? coberturaMsi(estados, planes) : new Map<string, never>()
    // Los archivados no se ven, pero sus mensualidades siguen en los estados.
    const data = filas
      .filter((f) => !archivado(f))
      .map((f) => vivo(sinEmbebidos(f), ciclo(f), hoy, cargo(f), coberturaDe(coberturas, f.id)))
    return { data, estados, planes, coberturas }
  }, [filas, foto, hoy, coberturaLista])

  function filaDe(id: string) {
    return filas.find((f) => f.id === id)
  }

  function parchar(id: string, cambios: Partial<Fila>) {
    setFilas((cur) => cur.map((f) => (f.id === id ? { ...f, ...cambios } : f)))
  }

  async function create(inst: NewInstallment): Promise<void> {
    if (!user) throw new Error('Not authenticated')
    const { charge_to_card: chargeToCard, adopt_tx_id: adoptar, billing_offset, ...row } = inst
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

    if (adoptar) {
      // El gasto ya está en el saldo: sólo cambia de tipo y apunta al plan. Si
      // no se puede, el plan se deshace — un plan con su compra contada dos
      // veces (como gasto y en el plan) es justo lo que esto evita.
      // Sólo un gasto suelto: si ya es de otro plan o se borró, no se toca.
      const { data: adoptados, error: adoptErr } = await supabase
        .from('transactions')
        .update({ type: 'installment', installment_id: inserted.id })
        .eq('id', adoptar)
        .eq('account_id', row.account_id ?? '')
        .is('installment_id', null)
        .in('type', ['transaction', 'sync'])
        .select('id, source')
      if (adoptErr || !adoptados || adoptados.length === 0) {
        // Si la escritura sí llegó (un error de red tras aplicarse), el gasto se
        // devuelve; sin esto quedaba como «Compra a meses» sin plan.
        if (adoptErr) {
          const { data: tx } = await supabase.from('transactions').select('source').eq('id', adoptar).maybeSingle()
          await supabase
            .from('transactions')
            .update({ type: (tx as { source?: string } | null)?.source === 'syncfy' ? 'sync' : 'transaction', installment_id: null })
            .eq('id', adoptar)
            .eq('installment_id', inserted.id)
        }
        const { error: delErr } = await supabase.from('installments').delete().eq('id', inserted.id)
        setFilas((prev) => prev.filter((i) => i.id !== base.id))
        if (delErr) throw new Error('No se pudo convertir el gasto y el plan quedó a medias: bórralo desde Cuentas.')
        throw adoptErr ?? new Error('Ese gasto ya no se puede convertir: puede que se haya borrado o que ya sea de otro plan.')
      }
    } else if (chargeToCard && row.account_id) {
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
    // Un cargo nuevo o un gasto convertido cambian el estado de cuenta.
    avisarCambioEnTarjetas()
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
    // El cargo de la base, no el embebido: pudo convertirse desde otro dispositivo.
    const cargo = await cargoActual(prev)
    if (cargo?.adoptado) {
      // Un gasto convertido no se queda sin tarjeta ni en cero: el plan seguiría
      // vivo y el gasto contaría dos veces. Para deshacerlo, se elimina el plan.
      const sinTarjeta = patch.account_id !== undefined && !patch.account_id
      const total = Number(nuevo.total_amount) - Number(plano.total_amount)
      if (sinTarjeta || cargo.amount + total <= 0) {
        throw new Error('Un gasto convertido no puede quedarse sin tarjeta: para deshacerlo, elimina el plan y el gasto vuelve a Movimientos.')
      }
    }
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

    if (!cargo) {
      await fetchInstallments()
      return { antes: null, despues: null }
    }
    const reg = registradoEl(plano, hoyLocal)
    const cuentaNueva = cuentaCambia ? patch.account_id ?? null : prev.account_id
    // Un gasto convertido es la compra completa: cambiar el plazo o la fecha no
    // lo encoge (sus mensualidades se pagaron por la tarjeta); sólo el total.
    const monto = cargo.adoptado
      ? Math.max(0, Math.round((cargo.amount + (Number(nuevo.total_amount) - Number(plano.total_amount))) * 100) / 100)
      : nuevoCargo(cargo.amount, [plano, cicloAntes], [nuevo, cicloDespues], reg)

    // La fecha de un gasto convertido es la de la compra del usuario: sólo
    // cambia si se cambió la fecha de compra, no con cualquier edición.
    const fechaCargo = cargo.adoptado
      ? patch.start_date !== undefined && patch.start_date !== String(prev.start_date ?? '').slice(0, 10)
        ? patch.start_date
        : cargo.date
      : nuevo.start_date
    try {
      if (!cuentaNueva || monto <= 0) {
        // «Sin tarjeta»: el cargo se quita (el formulario lo avisa antes).
        const { error: e } = await supabase.from('transactions').delete().eq('id', cargo.id)
        if (e) throw e
      } else if (
        Math.abs(monto - cargo.amount) < 0.005 &&
        cuentaNueva === cargo.account_id &&
        fechaCargo === cargo.date &&
        (cargo.adoptado || nuevo.name === prev.name)
      ) {
        // Nada que mover.
      } else if (migrado) {
        // Con la migración 036 el trigger recalcula el saldo al editar. Un
        // gasto convertido conserva su descripción: es la del usuario.
        const { error: e } = await supabase
          .from('transactions')
          .update({
            amount: monto,
            account_id: cuentaNueva,
            date: fechaCargo,
            ...(cargo.adoptado ? {} : { description: nuevo.name }),
          })
          .eq('id', cargo.id)
          .eq('installment_id', id)
        if (e) throw e
      } else if (cargo.adoptado) {
        // Sin la 036 habría que borrarlo y crearlo otra vez, y dejaría de ser el
        // gasto del usuario.
        throw new Error('Para cambiar el total, la fecha o la tarjeta de un gasto convertido, corre la migración 036 en Supabase.')
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
    avisarCambioEnTarjetas()
    return { antes: cargo.amount, despues: cuentaNueva && monto > 0 ? monto : 0 }
  }

  /** El cargo del plan como está en la base ahora; si no se puede leer, el embebido. */
  async function cargoActual(f: Fila): Promise<CargoMsi | null> {
    const { data } = await supabase
      .from('transactions')
      .select('id, amount, account_id, date, created_at, source, installment_id, type')
      .eq('installment_id', f.id)
      .eq('type', 'installment')
      .limit(1)
    const fila = ((data ?? []) as (MovEdc & { installment_id?: string | null })[]).find(
      (t) => t.installment_id === f.id && t.type === 'installment',
    )
    return fila ? cargoDesde(fila, f) : cargoDe(f)
  }

  /** Un gasto convertido vuelve a ser un gasto (con su tipo de antes). */
  async function devolverGasto(cargo: CargoMsi, planId: string): Promise<void> {
    const { error: e } = await supabase
      .from('transactions')
      .update({ type: cargo.tipoOriginal ?? 'transaction', installment_id: null })
      .eq('id', cargo.id)
      .eq('installment_id', planId)
    if (e) throw e
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
    const cal = calendarioMsi({ ...plano, month_status }, cicloDe(prev), hoyLocal, coberturaDe(coberturas, id))
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
          const month_status = liquidarMarcas(plano, cicloDe(prev), hoyLocal, coberturaDe(coberturas, id))
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
    // Un plan liquidado con «Restar del saldo» tiene un ajuste que dice qué
    // pagó. Borrarlo dejaba ese ajuste sin plan (la llave se pone en null) y
    // contaba como pago de todo el estado de cuenta, cubriendo otros planes.
    // Se archiva: deja de verse, pero los estados de cuenta lo siguen usando.
    const conAjuste =
      !!prev &&
      ((prev.vinculados ?? []).some((t) => t.type === 'adjustment') ||
        foto.movs.some((m) => m.installment_id === id && m.type === 'adjustment'))
    if (prev && conAjuste && (await tieneEsquemaMsi())) {
      const month_status = { ...marcasGuardables(sinEmbebidos(prev)), _oculto: true }
      parchar(id, { month_status })
      const { error: err } = await supabase
        .from('installments')
        .update({ month_status, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (err) {
        setFilas((cur) => cur.map((f) => (f.id === id ? prev : f)))
        throw err
      }
      avisarCambioEnTarjetas()
      return
    }
    const cargo = prev ? await cargoActual(prev) : null
    setFilas((cur) => cur.filter((i) => i.id !== id))
    // Un gasto convertido vuelve a ser el gasto que era: borrarlo con el plan
    // quitaba de tu historial una compra real.
    if (cargo?.adoptado) {
      try {
        await devolverGasto(cargo, id)
      } catch (backErr) {
        if (prev) setFilas((cur) => [prev, ...cur])
        throw backErr
      }
    } else if (cargo && opciones.quitarCargo) {
      // El cargo va primero: la llave foránea es `on delete set null`.
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
    avisarCambioEnTarjetas()
  }

  const active = useMemo(() => data.filter((i) => i.status === 'active'), [data])

  return {
    data: user ? data : EMPTY,
    active: user ? active : EMPTY,
    /** Estado de cuenta por tarjeta (id → estados, próximo pago, siguiente corte). */
    estados: user && fiables ? estados : SIN_ESTADOS,
    /** Planes vistos desde su tarjeta, para proyectar pagos. */
    planesTarjeta: planes,
    tarjetas: foto.tarjetas,
    movsTarjetas: foto.movs,
    estadosListos,
    /** Se puede confiar en la cobertura de los MSI (para «Liquidar»). */
    coberturaLista,
    /** No se pudo traer el estado de cuenta. */
    estadosFallaron: foto.listo && (foto.fallo || foto.falloVentana === claveVentana),
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
