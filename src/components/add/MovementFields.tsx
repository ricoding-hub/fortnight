import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Segmented } from '@/components/ui/Segmented'
import { FooterPortal } from '@/components/add/FooterPortal'
import { useGamification, XP_PER_TX } from '@/hooks/useGamification'
import { useToast } from '@/hooks/useToast'
import { useOrdenCuentas } from '@/hooks/useOrdenCuentas'
import { usePagarTarjeta } from '@/hooks/usePagarTarjeta'
import { guardarPref, prefValida } from '@/lib/addPrefs'
import { toKey } from '@/lib/calendar'
import { formatMXN } from '@/lib/format'
import { isMoneyInput, moneyNum } from '@/lib/money'
import type { NewTransaction } from '@/hooks/useTransactions'
import type { Account, Category } from '@/types'

export type Direction = 'spend' | 'receive'

interface MovementFieldsProps {
  direction: Direction
  accounts: Account[]
  categories: Category[]
  onCreate: (tx: NewTransaction) => Promise<void>
  footerTarget: HTMLElement | null
  onDone: () => void
}

/** Errores por campo. Se muestran junto al campo, no con un temblor. */
interface Errores {
  amount?: string
  category?: string
  account?: string
  date?: string
}

/**
 * Gasto o ingreso: lo mínimo para registrarlo bien.
 *
 * Reemplaza el numpad propio. Un campo de texto con teclado decimal es más
 * rápido que tocar teclas dibujadas, acepta `574.50`, `574,5` y `1,234.50`, deja
 * pegar un monto, y no se come media pantalla: el numpad ocupaba ~40 % y por eso
 * la rejilla de categorías se cortaba a media fila.
 */
export function MovementFields({ direction, accounts, categories, onCreate, footerTarget, onDone }: MovementFieldsProps) {
  const toast = useToast()
  const { refetch: refetchGami } = useGamification()
  const esGasto = direction === 'spend'
  const claveCat = esGasto ? 'categoria:gasto' : 'categoria:ingreso'

  const lista = useMemo(
    () =>
      esGasto
        ? categories.filter((c) => c.kind === 'variable' || c.kind === 'fixed')
        : categories.filter((c) => c.kind === 'income'),
    [categories, esGasto],
  )

  // Lo de la última vez, si sigue existiendo; si no, la primera cuenta.
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => toKey(new Date()))
  const [note, setNote] = useState('')
  const [categoryId, setCategoryId] = useState(
    () => prefValida(claveCat, lista.map((c) => c.id)) ?? '',
  )
  // Gasto e ingreso recuerdan su cuenta por separado: un ingreso casi nunca va
  // a la tarjeta con la que se gasta.
  const claveCuenta = esGasto ? 'cuenta' : 'cuenta:ingreso'
  const [accountId, setAccountId] = useState(
    () => prefValida(claveCuenta, accounts.map((a) => a.id)) ?? accounts[0]?.id ?? '',
  )
  /**
   * «Ingreso» en una tarjeta: antes era la única forma de pagarla, con
   * categoría Salario. Ahora es un pago (sale de una cuenta de débito, no es
   * ingreso) o un reembolso (una devolución, con categoría de gasto).
   */
  const [abono, setAbono] = useState<'pago' | 'reembolso'>('pago')
  const debitos = accounts.filter((a) => a.type === 'debit')
  const [origen, setOrigen] = useState(() => prefValida('pago:origen', debitos.map((d) => d.id)) ?? debitos[0]?.id ?? '')
  const { pagar } = usePagarTarjeta()
  const [errores, setErrores] = useState<Errores>({})
  const [enviando, setEnviando] = useState(false)
  const intentado = useRef(false)

  const cuenta = accounts.find((a) => a.id === accountId)
  const { orden } = useOrdenCuentas()
  const gruposDeCuentas = orden
    .map((tipo) => ({ tipo, cuentas: accounts.filter((a) => a.type === tipo) }))
    .filter((g) => g.cuentas.length > 0)
  const esCredito = cuenta?.type === 'credit'
  const esPago = !esGasto && esCredito && abono === 'pago'
  const esReembolso = !esGasto && esCredito && abono === 'reembolso'
  // Las categorías que tocan: de gasto para gastos y reembolsos, de ingreso para ingresos.
  const categoriasVisibles = esReembolso ? categories.filter((c) => c.kind === 'variable' || c.kind === 'fixed') : lista
  const monto = moneyNum(amount)
  const montoValido = isMoneyInput(amount) && monto > 0

  function validar(): Errores {
    const e: Errores = {}
    if (!montoValido) e.amount = amount.trim() === '' ? 'Escribe el monto' : 'Monto inválido, por ejemplo 574.50'
    if (!esPago && !categoryId) e.category = 'Elige una categoría'
    if (!accountId) e.account = 'Elige una cuenta'
    if (!date) e.date = 'Elige la fecha'
    else if (date > toKey(new Date())) e.date = 'No puede ser futura'
    return e
  }

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault()
    if (enviando) return
    intentado.current = true
    const e = validar()
    setErrores(e)
    if (Object.keys(e).length > 0) return

    setEnviando(true)
    if (esPago && cuenta) {
      try {
        const de = debitos.find((d) => d.id === origen) ?? null
        await pagar({
          card: { id: cuenta.id, name: cuenta.name },
          amount: monto,
          from: de ? { id: de.id, name: de.name } : null,
          date,
          nota: note,
        })
        guardarPref('pago:origen', origen)
        guardarPref(claveCuenta, accountId)
        toast.success('Pago registrado', `${formatMXN(monto)} a ${cuenta.name}${de ? ` desde ${de.name}` : ''}`)
        onDone()
      } catch {
        toast.error('Error al guardar', 'No se pudo registrar el pago')
        setEnviando(false)
      }
      return
    }
    // Gasto en débito resta; en tarjeta SUBE la deuda. Un reembolso en tarjeta
    // la baja; un ingreso en débito suma.
    const signo = esGasto ? (esCredito ? 1 : -1) : esCredito ? -1 : 1
    try {
      await onCreate({
        account_id: accountId,
        amount: signo * monto,
        category_id: categoryId,
        description: note.trim() || null,
        date,
      })
      if (!esReembolso) guardarPref(claveCat, categoryId)
      guardarPref(claveCuenta, accountId)
      // XP y racha los da el trigger tr_award_xp_on_transaction; esto es el
      // respaldo por si el tiempo real tarda en llegar.
      window.setTimeout(() => void refetchGami(), 400)
      toast.success(
        esGasto ? 'Gasto registrado' : esReembolso ? 'Reembolso registrado' : 'Ingreso registrado',
        `${formatMXN(monto)} · ${cuenta?.name ?? ''} · +${XP_PER_TX} XP`,
      )
      onDone()
    } catch {
      toast.error('Error al guardar', 'No se pudo registrar el movimiento')
      setEnviando(false)
    }
  }

  // Una vez que se intentó guardar, los errores se corrigen en vivo.
  function revalidar(parche: Partial<{ amount: string; categoryId: string; accountId: string; date: string }>) {
    if (!intentado.current) return
    const previo = { amount, categoryId, accountId, date }
    const n = { ...previo, ...parche }
    const e: Errores = {}
    if (!(isMoneyInput(n.amount) && moneyNum(n.amount) > 0)) e.amount = n.amount.trim() === '' ? 'Escribe el monto' : 'Monto inválido, por ejemplo 574.50'
    if (!esPago && !n.categoryId) e.category = 'Elige una categoría'
    if (!n.accountId) e.account = 'Elige una cuenta'
    if (!n.date) e.date = 'Elige la fecha'
    else if (n.date > toKey(new Date())) e.date = 'No puede ser futura'
    setErrores(e)
  }

  const accion = esGasto ? 'Registrar gasto' : esPago ? 'Registrar pago' : esReembolso ? 'Registrar reembolso' : 'Registrar ingreso'
  const etiquetaBoton = `${accion}${montoValido ? ` · ${formatMXN(monto)}` : ''}`

  return (
    <form id="add-form" onSubmit={guardar} className="flex flex-col gap-3" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Monto"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          // Foco al abrir: el monto es lo primero que se escribe, y así el
          // teclado decimal ya está listo.
          autoFocus
          value={amount}
          error={errores.amount}
          onChange={(e) => { setAmount(e.target.value); revalidar({ amount: e.target.value }) }}
        />
        <Input
          label="Fecha"
          type="date"
          max={toKey(new Date())}
          value={date}
          error={errores.date}
          className="w-full min-w-0"
          onChange={(e) => { setDate(e.target.value); revalidar({ date: e.target.value }) }}
        />
      </div>

      {!esPago && (
      <Select
        label="Categoría"
        value={categoryId}
        error={errores.category}
        onChange={(e) => { setCategoryId(e.target.value); revalidar({ categoryId: e.target.value }) }}
      >
        <option value="">Selecciona…</option>
        {esGasto || esReembolso ? (
          <>
            <optgroup label="Variables">
              {categoriasVisibles.filter((c) => c.kind === 'variable').map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
            <optgroup label="Fijos">
              {categoriasVisibles.filter((c) => c.kind === 'fixed').map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
          </>
        ) : (
          lista.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)
        )}
      </Select>
      )}

      <Select
        label="Cuenta"
        value={accountId}
        error={errores.account}
        onChange={(e) => { setAccountId(e.target.value); revalidar({ accountId: e.target.value }) }}
      >
        {accounts.length === 0 && <option value="">Crea una cuenta primero</option>}
        {/* Agrupadas por tipo, en el orden que el usuario eligió en Cuentas. */}
        {gruposDeCuentas.length > 1
          ? gruposDeCuentas.map((g) => (
              <optgroup key={g.tipo} label={g.tipo === 'credit' ? 'Tarjetas de crédito' : 'Débito'}>
                {g.cuentas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </optgroup>
            ))
          : accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.type === 'credit' ? ' · tarjeta' : ''}
              </option>
            ))}
      </Select>

      {/* El signo de una tarjeta es el contrario al de una cuenta de débito, y
          antes se invertía sin decirlo. */}
      {esCredito && cuenta && esGasto && (
        <p className="-mt-1 rounded-xl bg-bg-secondary px-3.5 py-2 text-[12.5px] text-text-secondary">
          Es una tarjeta: este gasto SUBE la deuda de {cuenta.name}.
        </p>
      )}

      {esCredito && cuenta && !esGasto && (
        <div className="flex flex-col gap-2">
          <Segmented
            ariaLabel="Qué es"
            value={abono}
            onChange={(v) => {
              setAbono(v)
              setCategoryId('')
            }}
            options={[
              { value: 'pago', label: 'Pago a la tarjeta' },
              { value: 'reembolso', label: 'Reembolso' },
            ]}
          />
          {esPago ? (
            <Select label="¿De dónde salió el dinero?" value={origen} onChange={(e) => setOrigen(e.target.value)}>
              {debitos.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
              <option value="">No registrar de dónde salió</option>
            </Select>
          ) : (
            <p className="rounded-xl bg-bg-secondary px-3.5 py-2 text-[12.5px] text-text-secondary">
              Una devolución de una compra: baja la deuda de {cuenta.name} y resta de esa categoría.
            </p>
          )}
          {esPago && (
            <p className="text-[12px] text-text-secondary">
              Un pago no es ingreso: baja la deuda de {cuenta.name}
              {origen ? ' y el saldo de la cuenta de la que salió' : ''}.
            </p>
          )}
        </div>
      )}

      <Input
        label="Nota (opcional)"
        placeholder={esGasto ? 'Tacos, gasolina…' : 'Quincena, venta…'}
        autoComplete="off"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <FooterPortal target={footerTarget}>
        <Button type="submit" form="add-form" loading={enviando}>
          {etiquetaBoton}
        </Button>
      </FooterPortal>
    </form>
  )
}
