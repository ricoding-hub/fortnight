import { useState } from 'react'
import { Link } from 'react-router-dom'
import { addMonths, format } from 'date-fns'
import { es } from 'date-fns/locale'
import clsx from 'clsx'
import {
  IconBuildingBank,
  IconPencil,
  IconSettings,
  IconCheck,
  IconX,
  IconArrowUp,
  IconArrowDown,
} from '@tabler/icons-react'
import { CreditCycleBadge } from '@/components/CreditCycleBadge'
import { useToast } from '@/hooks/useToast'
import { formatMXN } from '@/lib/format'
import { bankLogoUrl } from '@/lib/banks'
import {
  getExigibleEsteCiclo,
  getRevolvingBalance,
  prepayMonthsCovered,
} from '@/lib/debt'
import type { Account, Installment } from '@/types'

function SyncedLabel({ name }: { name: string }) {
  const label = name !== 'Banco conectado' ? name : null
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-primary/80">
      <IconBuildingBank size={9} className="shrink-0" />
      {label ? label : 'Bancario'}
    </span>
  )
}

interface AccountCardProps {
  account: Account
  installments?: Installment[]
  /** Persists a new balance; the hook records the delta as an adjustment. */
  onSaveBalance: (account: Account, newBalance: number) => Promise<void>
  onEditDetails: (account: Account) => void
  /** When true the card shows reorder controls instead of edit affordances. */
  reorderMode?: boolean
  canMoveUp?: boolean
  canMoveDown?: boolean
  onMoveUp?: () => void
  onMoveDown?: () => void
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

interface AvatarProps {
  account: Account
}

function Avatar({ account }: AvatarProps) {
  const [logoFailed, setLogoFailed] = useState(false)
  const showLogo = account.logo_domain && !logoFailed
  return (
    <div
      className={clsx(
        'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-xs font-bold text-white shadow-sm',
        showLogo && 'bg-white',
      )}
      style={!showLogo ? { backgroundColor: account.color ?? '#6B7194' } : undefined}
    >
      {showLogo ? (
        <img
          src={bankLogoUrl(account.logo_domain!)}
          alt={account.name}
          className="h-7 w-7 object-contain"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        initialsOf(account.name)
      )}
    </div>
  )
}

export function AccountCard({
  account,
  installments = [],
  onSaveBalance,
  onEditDetails,
  reorderMode = false,
  canMoveUp = false,
  canMoveDown = false,
  onMoveUp,
  onMoveDown,
}: AccountCardProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [invalid, setInvalid] = useState(false)

  const isCredit = account.type === 'credit'
  const isSynced = account.source === 'syncfy'

  const exigible = isCredit ? getExigibleEsteCiclo(account, installments) : 0
  const revolving = isCredit ? getRevolvingBalance(account, installments) : 0
  const monthsCovered =
    isCredit && account.prepay_buffer > 0 ? prepayMonthsCovered(account, installments) : null
  const coveredUntil =
    monthsCovered != null
      ? format(addMonths(new Date(), monthsCovered), 'MMM yyyy', { locale: es })
      : null

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

  const displayBalance = isCredit ? Math.abs(account.balance) : account.balance

  // Reorder mode renders a non-link version so taps don't navigate.
  if (reorderMode) {
    return (
      <div className="flex items-center gap-3 py-3.5">
        <Avatar account={account} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">
            {account.name}
          </p>
          <div className="flex items-center gap-1.5">
            {isSynced && account.institution_name && (
              <SyncedLabel name={account.institution_name} />
            )}
            <span className="text-[11px] text-text-tertiary tabular-nums">
              {formatMXN(displayBalance)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label="Mover hacia arriba"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-secondary text-text-secondary transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:hover:bg-bg-secondary disabled:hover:text-text-secondary"
          >
            <IconArrowUp size={16} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label="Mover hacia abajo"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-secondary text-text-secondary transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:hover:bg-bg-secondary disabled:hover:text-text-secondary"
          >
            <IconArrowDown size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 py-3.5 transition-colors">
      <Link
        to={`/cuentas/movimientos?account=${account.id}`}
        aria-label={`Ver movimientos de ${account.name}`}
        className="-my-3.5 flex min-w-0 flex-1 items-center gap-3 rounded-lg py-3.5 transition-colors hover:bg-bg-secondary/40 active:bg-bg-secondary/60"
      >
        <Avatar account={account} />

        {/* Name + sync/cycle badge on second line */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">
            {account.name}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {isSynced && account.institution_name && (
              <SyncedLabel name={account.institution_name} />
            )}
            {isCredit && <CreditCycleBadge account={account} />}
          </div>
          {isCredit && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] tabular-nums text-text-tertiary">
              <span>
                Exigible{' '}
                <span className="font-semibold text-debt">{formatMXN(exigible)}</span>
              </span>
              <span className="text-border">·</span>
              <span>Revolvente {formatMXN(revolving)}</span>
            </div>
          )}
          {isCredit && account.prepay_buffer > 0 && (
            <span className="mt-1 inline-flex items-center rounded-full bg-asset/10 px-2 py-0.5 text-[10px] font-semibold text-asset-deep">
              Buffer {formatMXN(account.prepay_buffer)}
              {coveredUntil && ` · hasta ${coveredUntil}`}
            </span>
          )}
        </div>
      </Link>

      {/* Inline edit or display */}
      {editing ? (
        <div className="flex flex-col items-end gap-1">
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
                'h-10 w-24 rounded-xl border bg-bg-elevated px-3 text-base tabular-nums text-text',
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
          {isSynced && (
            <p className="text-[10px] text-text-tertiary">
              Se sobreescribirá en la próxima sincronización
            </p>
          )}
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
            {formatMXN(displayBalance)}
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
