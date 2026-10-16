import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { useToast } from '@/hooks/useToast'
import { toKey } from '@/lib/calendar'
import { formatMXN } from '@/lib/format'
import { isMoneyInput, moneyNum } from '@/lib/money'
import type { TransactionPatch } from '@/hooks/useTransactions'
import type { Account, Category, Transaction } from '@/types'

interface TransactionEditModalProps {
  transaction: Transaction
  accounts: Account[]
  categories: Category[]
  onClose: () => void
  onSave: (id: string, patch: TransactionPatch) => Promise<void>
}

/** ¿Es un gasto? En débito el gasto es negativo; en una tarjeta, positivo (sube la deuda). */
function esGastoEn(amount: number, cuenta: Account | undefined) {
  return cuenta?.type === 'credit' ? amount > 0 : amount < 0
}

function signo(esGasto: boolean, cuenta: Account | undefined) {
  if (cuenta?.type === 'credit') return esGasto ? 1 : -1
  return esGasto ? -1 : 1
}

/**
 * Editar un movimiento sin borrarlo y volverlo a crear.
 *
 * El monto se escribe en positivo y el tipo (gasto o ingreso) decide el signo
 * según la cuenta: si lo mueves de una cuenta de débito a una tarjeta, el signo
 * se recalcula solo. Los sincronizados del banco sólo dejan cambiar categoría y
 * nota; el resto lo manda el banco.
 */
export function TransactionEditModal({ transaction: tx, accounts, categories, onClose, onSave }: TransactionEditModalProps) {
  const toast = useToast()
  const original = accounts.find((a) => a.id === tx.account_id)
  const sincronizado = tx.source === 'syncfy'
  const esAjuste = tx.type === 'adjustment'
  // Un pago de tarjeta son dos renglones: aquí sólo cambian fecha y nota (en
  // los dos). El monto se corrige borrando el pago y registrándolo otra vez.
  const esPago = tx.type === 'transfer'

  const [esGasto, setEsGasto] = useState(esGastoEn(Number(tx.amount), original))
  const [monto, setMonto] = useState(String(Math.abs(Number(tx.amount))))
  const [fecha, setFecha] = useState(String(tx.date).slice(0, 10))
  const [cuentaId, setCuentaId] = useState(tx.account_id)
  const [categoriaId, setCategoriaId] = useState(tx.category_id ?? '')
  const [nota, setNota] = useState(tx.description ?? '')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cuenta = accounts.find((a) => a.id === cuentaId)
  const montoValido = isMoneyInput(monto)
  const nuevoMonto = montoValido ? Math.round(moneyNum(monto) * signo(esGasto, cuenta) * 100) / 100 : NaN
  const delta = Number.isFinite(nuevoMonto) && cuentaId === tx.account_id ? nuevoMonto - Number(tx.amount) : null

  const lista = categories.filter((c) => (esGasto ? c.kind !== 'income' : c.kind === 'income'))

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!sincronizado && !esPago && !montoValido) return setError('Escribe un monto, por ejemplo 574.50')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > toKey(new Date())) return setError('Elige una fecha que no sea futura')
    const patch: TransactionPatch = esPago
      ? { date: fecha, description: nota.trim() || null }
      : sincronizado
      ? { category_id: categoriaId || null, description: nota.trim() || null }
      : {
          amount: nuevoMonto,
          account_id: cuentaId,
          date: fecha,
          category_id: esAjuste ? tx.category_id : categoriaId || null,
          description: nota.trim() || null,
        }
    setGuardando(true)
    try {
      await onSave(tx.id, patch)
      toast.success('Movimiento actualizado', nota.trim() || formatMXN(Math.abs(Number(patch.amount ?? tx.amount))))
      onClose()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      open
      title="Editar movimiento"
      onClose={onClose}
      footer={
        <Button type="submit" form="editar-movimiento" loading={guardando}>
          Guardar cambios
        </Button>
      }
    >
      <form id="editar-movimiento" onSubmit={(e) => void guardar(e)} className="flex flex-col gap-3" noValidate>
        {sincronizado && (
          <p className="rounded-xl bg-bg-secondary px-3.5 py-2.5 text-[12.5px] text-text-secondary">
            Viene de tu banco: el monto, la cuenta y la fecha los manda el banco. Aquí cambias la categoría y la nota.
          </p>
        )}

        {esPago && (
          <>
            <p className="rounded-xl bg-bg-secondary px-3.5 py-2.5 text-[12.5px] text-text-secondary">
              Es un pago de tarjeta: aquí cambias la fecha y la nota de sus dos partes. Para cambiar el monto, bórralo y
              regístralo otra vez.
            </p>
            <Input
              label="Fecha"
              type="date"
              max={toKey(new Date())}
              className="w-full min-w-0"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </>
        )}

        {!sincronizado && !esAjuste && !esPago && (
          <Segmented
            ariaLabel="Tipo de movimiento"
            value={esGasto}
            onChange={setEsGasto}
            options={[
              { value: true, label: 'Gasto', tone: 'debt' },
              { value: false, label: 'Ingreso', tone: 'asset' },
            ]}
          />
        )}

        {!sincronizado && !esPago && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Monto"
              inputMode="decimal"
              autoComplete="off"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
            <Input
              label="Fecha"
              type="date"
              max={toKey(new Date())}
              className="w-full min-w-0"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
        )}

        {!sincronizado && !esPago && (
          <Select label="Cuenta" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.type === 'credit' ? ' · tarjeta' : ''}
              </option>
            ))}
          </Select>
        )}

        {!esAjuste && !esPago && (
          <Select label="Categoría" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Sin categoría</option>
            {lista.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}

        <Input label="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />

        {/* Lo que va a pasar con el saldo, antes de guardar. */}
        {!sincronizado && !esPago && cuenta && (
          <p className="rounded-xl bg-bg-secondary px-3.5 py-2.5 text-[12.5px] text-text-secondary">
            {cuentaId !== tx.account_id
              ? `Sale de ${original?.name ?? 'la cuenta anterior'} y entra en ${cuenta.name}: los dos saldos se ajustan.`
              : delta != null && Math.abs(delta) >= 0.005
                ? `${cuenta.type === 'credit' ? 'La deuda' : 'El saldo'} de ${cuenta.name} ${
                    delta > 0 ? 'sube' : 'baja'
                  } ${formatMXN(Math.abs(delta))}.`
                : 'El saldo no cambia.'}
          </p>
        )}

        {error && <p className="text-[12.5px] font-semibold text-debt-ink">• {error}</p>}
      </form>
    </Modal>
  )
}
