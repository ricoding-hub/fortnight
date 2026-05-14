import { useState } from 'react'
import clsx from 'clsx'
import { IconPencil, IconSettings, IconCheck, IconX } from '@tabler/icons-react'
import { CreditCycleBadge } from '@/components/CreditCycleBadge'
import { useToast } from '@/hooks/useToast'
import { formatMXN } from '@/lib/format'
import type { Account } from '@/types'

interface AccountCardProps {
  account: Account
  /** Persists a new balance; the hook records the delta as an adjustment. */
  onSaveBalance: (account: Account, newBalance: number) => Promise<void>
  onEditDetails: (account: Account) => void
}

/** First letters of up to the first two words, e.g. "Nu Débito" -> "ND". */
function initialsOf(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return initials || '?'
}

export function AccountCard({
  account,
  onSaveBalance,
  onEditDetails,
}: AccountCardProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [invalid, setInvalid] = useState(false)

  const isCredit = account.type === 'credit'

  function startEdit() {
    setValue(String(account.balance))
    setInvalid(false)
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
    setInvalid(false)
  }

  const toast = useToast()

  async function save() {
    const next = Number(value)
    if (value.trim() === '' || Number.isNaN(next) || next < 0) {
      setInvalid(true)
      return
    }
    setSaving(true)
    try {
      await onSaveBalance(account, next)
      setEditing(false)
      toast.success('Saldo actualizado', `El nuevo saldo es ${formatMXN(next)}`)
    } catch {
      setInvalid(true)
      toast.error('Error', 'No se pudo actualizar el saldo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-3 py-3.5 transition-colors">
      {/* Avatar */}
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm"
        style={{ backgroundColor: account.color ?? '#6B7194' }}
      >
        {initialsOf(account.name)}
      </div>

      {/* Name + cycle badge */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">
          {account.name}
        </p>
        {isCredit && (
          <CreditCycleBadge
            cutDay={account.cut_day}
            paymentDueDay={account.payment_due_day}
          />
        )}
      </div>

      {/* Inline edit or display */}
      {editing ? (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
              if (e.key === 'Escape') cancel()
            }}
            inputMode="decimal"
            aria-label="Nuevo saldo"
            aria-invalid={invalid || undefined}
            className={clsx(
              'h-10 w-24 rounded-xl border bg-bg-elevated px-3 text-sm tabular-nums text-text',
              'transition-all duration-[--duration-fast]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              invalid ? 'border-debt ring-1 ring-debt/20' : 'border-border',
            )}
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            aria-label="Guardar saldo"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
          >
            <IconCheck size={16} />
          </button>
          <button
            type="button"
            onClick={cancel}
            aria-label="Cancelar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-secondary"
          >
            <IconX size={16} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={startEdit}
            className={clsx(
              'text-sm font-bold tabular-nums transition-colors',
              isCredit ? 'text-debt' : 'text-text',
            )}
          >
            {formatMXN(account.balance)}
          </button>
          <button
            type="button"
            onClick={startEdit}
            aria-label="Editar saldo"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-secondary hover:text-text-secondary"
          >
            <IconPencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => onEditDetails(account)}
            aria-label="Ajustes de la cuenta"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-secondary hover:text-text-secondary"
          >
            <IconSettings size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
