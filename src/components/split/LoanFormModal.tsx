import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@/components/ui/Button'
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
  const [direction, setDirection] = useState<LoanDirection>(defaultDirection)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (open) {
      setName(editingLoan?.name ?? '')
      setAmount(editingLoan ? String(editingLoan.amount) : '')
      setNotes(editingLoan?.notes ?? '')
      setDirection(editingLoan?.direction ?? defaultDirection)
      setFormError('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = Number(amount)
    if (!name.trim()) { setFormError('Escribe un nombre'); return }
    if (!amount || Number.isNaN(num) || num <= 0) { setFormError('Escribe un monto válido'); return }
    setSubmitting(true)
    try {
      if (isEdit) {
        await onEdit(editingLoan.id, {
          name: name.trim(),
          amount: num,
          notes: notes.trim() || null,
          direction,
        })
      } else {
        await onCreate({ name: name.trim(), amount: num, notes: notes.trim() || null, direction })
      }
      onClose()
    } catch {
      setFormError('No se pudo guardar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar préstamo' : 'Nuevo préstamo'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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

        <Input
          label="Monto"
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0.01"
          step="any"
        />

        <Input
          label="Concepto (opcional)"
          placeholder="Para el celular, comida de ayer…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {formError && <p className="text-xs text-debt">• {formError}</p>}

        <Button type="submit" loading={submitting} className="mt-1">
          {isEdit ? 'Guardar cambios' : 'Registrar préstamo'}
        </Button>
      </form>
    </Modal>
  )
}
