import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@/components/ui/Button'
import { moneyNum } from '@/lib/money'
import { toKey } from '@/lib/calendar'
import { diaDelPrestamo } from '@/lib/loanFormat'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { NewLoan } from '@/hooks/useLoans'
import type { Loan, LoanDirection } from '@/types'

/**
 * The app's only loan create/edit form. Extracted from MisPrestamos so Home and
 * the group detail can edit a loan too. Group-side bookkeeping (stamping
 * `group_id` on create, renaming the split member on rename) stays with the
 * caller via onCreate/onEdit.
 */
export function LoanFormModal({
  open,
  onClose,
  defaultDirection,
  editingLoan,
  existingNames,
  onCreate,
  onEdit,
}: {
  open: boolean
  onClose: () => void
  defaultDirection: LoanDirection
  editingLoan: Loan | null
  existingNames: string[]
  onCreate: (data: NewLoan) => Promise<void>
  onEdit: (id: string, patch: Partial<NewLoan>) => Promise<void>
}) {
  const isEdit = editingLoan !== null

  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  /** Día EN QUE OCURRIÓ el préstamo; el de registro es siempre hoy. */
  const [date, setDate] = useState('')
  const [direction, setDirection] = useState<LoanDirection>(defaultDirection)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (open) {
      setName(editingLoan?.name ?? '')
      setAmount(editingLoan ? String(editingLoan.amount) : '')
      setNotes(editingLoan?.notes ?? '')
      setDate(editingLoan ? diaDelPrestamo(editingLoan) : toKey(new Date()))
      setDirection(editingLoan?.direction ?? defaultDirection)
      setFormError('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = moneyNum(amount)
    if (!name.trim()) { setFormError('Escribe un nombre'); return }
    if (!amount || Number.isNaN(num) || num <= 0) { setFormError('Escribe un monto válido'); return }
    if (!date) { setFormError('Elige la fecha del préstamo'); return }
    if (date > toKey(new Date())) { setFormError('La fecha no puede ser futura'); return }
    setSubmitting(true)
    try {
      if (isEdit) {
        await onEdit(editingLoan.id, {
          name: name.trim(),
          amount: num,
          notes: notes.trim() || null,
          direction,
          loan_date: date,
        })
      } else {
        // Hoy no se envía: es el valor por omisión, y así un préstamo de hoy se
        // registra igual aunque la migración 034 aún no se haya corrido.
        await onCreate({
          name: name.trim(),
          amount: num,
          notes: notes.trim() || null,
          direction,
          ...(date !== toKey(new Date()) ? { loan_date: date } : {}),
        })
      }
      onClose()
    } catch (e) {
      setFormError(e instanceof Error && /migración/.test(e.message) ? e.message : 'No se pudo guardar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar préstamo' : 'Nuevo préstamo'}
      footer={
        <div className="flex flex-col gap-2">
          {formError && <p className="text-xs font-semibold text-debt">• {formError}</p>}
          <Button type="submit" form="prestamo-form" loading={submitting}>
            {isEdit ? 'Guardar cambios' : 'Registrar préstamo'}
          </Button>
        </div>
      }
    >
      <form id="prestamo-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Direction toggle */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-text">Tipo</p>
          <div className="flex overflow-hidden rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setDirection('owed_to_me')}
              className={clsx(
                'flex-1 py-2.5 text-[13px] font-bold transition-colors',
                direction === 'owed_to_me'
                  ? 'bg-primary text-white'
                  : 'bg-bg text-text-secondary hover:bg-primary/5',
              )}
            >
              Me deben
            </button>
            <button
              type="button"
              onClick={() => setDirection('i_owe')}
              className={clsx(
                'flex-1 py-2.5 text-[13px] font-bold transition-colors',
                direction === 'i_owe'
                  ? 'bg-debt text-white'
                  : 'bg-bg text-text-secondary hover:bg-debt/5',
              )}
            >
              Yo debo
            </button>
          </div>
        </div>

        {/* Name with autocomplete */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="loan-name-input" className="text-sm font-medium text-text">
            {direction === 'owed_to_me' ? '¿Quién te debe?' : '¿A quién le debes?'}
          </label>
          <input
            id="loan-name-input"
            list="loan-names-list"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre"
            autoComplete="off"
            className="h-12 w-full rounded-xl border border-border bg-bg-elevated px-4 text-base text-text placeholder:text-text-tertiary transition-all hover:border-border-strong focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          <datalist id="loan-names-list">
            {existingNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Monto"
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div className="min-w-0">
            <Input
              label="Fecha"
              type="date"
              value={date}
              max={toKey(new Date())}
              onChange={(e) => setDate(e.target.value)}
              className="w-full min-w-0"
            />
          </div>
        </div>

        <Input
          label="Concepto (opcional)"
          placeholder="Para el celular, comida de ayer…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

      </form>
    </Modal>
  )
}
