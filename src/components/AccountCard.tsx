import { useState } from 'react'
import { Link } from 'react-router-dom'
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
import { moneyNum } from '@/lib/money'
import { fechaCorta } from '@/lib/movementDates'
import type { EstadosTarjeta } from '@/lib/estadoDeCuenta'
import type { Account } from '@/types'

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
  /** Persists a new balance; the hook records the delta as an adjustment (dated `fecha`, or today). */
  onSaveBalance: (account: Account, newBalance: number, fecha?: string) => Promise<void>
  onEditDetails: (account: Account) => void
  /** When true the card shows reorder controls instead of edit affordances. */
  reorderMode?: boolean
  canMoveUp?: boolean
  canMoveDown?: boolean
  onMoveUp?: () => void
  onMoveDown?: () => void
  /** Estado de cuenta de la tarjeta (sólo crédito). */
  estado?: EstadosTarjeta
  /** Abrir «Pagar» de esta tarjeta, opcionalmente con un monto ya escrito. */
  onPagar?: (monto?: number) => void
  onVerEstado?: () => void
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
  onSaveBalance,
  onEditDetails,
  reorderMode = false,
  canMoveUp = false,
  canMoveDown = false,
  onMoveUp,
  onMoveDown,
  estado,
  onPagar,
  onVerEstado,
}: AccountCardProps) {
  const [editing, setEditing] = useState(false)
  /**
   * Bajó el saldo de una tarjeta: ¿fue un pago? (Es como casi todos actualizan.)
   * Subió: ¿son compras de antes del corte? Fechado hoy, el aumento se tomaba
   * como compra nueva y el pago para no generar intereses salía de menos.
   */
  const [pregunta, setPregunta] = useState<
    { tipo: 'baja'; diff: number; next: number } | { tipo: 'sube'; diff: number; next: number; corte: string } | null
  >(null)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [invalid, setInvalid] = useState(false)

  const isCredit = account.type === 'credit'
  const isSynced = account.source === 'syncfy'

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

  async function save(forzar = false, fecha?: string) {
    // `moneyNum` entiende «1,234.50»; en una tarjeta, negativo es saldo a favor.
    const next = moneyNum(value)
    if (value.trim() === '' || Number.isNaN(next) || (!isCredit && next < 0)) {
      setInvalid(true)
      return
    }
    const actual = Number(account.balance) || 0
    if (!forzar && isCredit && onPagar && next < actual - 0.005) {
      // Bajar la deuda a mano casi siempre es un pago: registrarlo como tal hace
      // que salga de tu cuenta de débito y cuente en tu estado de cuenta.
      setPregunta({ tipo: 'baja', diff: Math.round((actual - next) * 100) / 100, next })
      return
    }
    const corte = estado && !estado.sinCorte ? estado.ultimo?.corte : undefined
    if (!forzar && isCredit && corte && next > actual + 0.005) {
      setPregunta({ tipo: 'sube', diff: Math.round((next - actual) * 100) / 100, next, corte })
      return
    }
    setPregunta(null)
    setSaving(true)
    try {
      await onSaveBalance(account, next, fecha)
      setEditing(false)
      toast.success('Saldo actualizado', `El nuevo saldo es ${formatMXN(next)}`)
    } catch {
      setInvalid(true)
      toast.error('Error', 'No se pudo actualizar el saldo')
    } finally {
      setSaving(false)
    }
  }

  const saldo = Number(account.balance) || 0
  // Una tarjeta con saldo negativo tiene dinero a tu favor; antes salía como deuda roja.
  const aFavor = isCredit && saldo < -0.005
  const displayBalance = isCredit ? Math.abs(saldo) : saldo

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
    <div className="flex flex-col">
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
            {isCredit && <CreditCycleBadge account={account} estado={estado} />}
          </div>
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
              aFavor ? 'text-asset-ink' : isCredit ? 'text-debt' : 'text-text',
            )}
          >
            {aFavor ? `A favor ${formatMXN(displayBalance)}` : formatMXN(displayBalance)}
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

      {pregunta?.tipo === 'sube' && (
        <div className="mb-3 flex flex-col gap-2 rounded-xl bg-primary-soft/40 px-3.5 py-2.5">
          <p className="text-[12.5px] text-text">
            Subiste la deuda {formatMXN(pregunta.diff)}. ¿Son compras de antes del corte del {fechaCorta(pregunta.corte)}?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void save(true, pregunta.corte)}
              className="min-h-[36px] rounded-full bg-primary-deep px-3.5 text-[12.5px] font-bold text-white"
            >
              Sí, van en ese estado de cuenta
            </button>
            <button
              type="button"
              onClick={() => void save(true)}
              className="min-h-[36px] rounded-full border border-border bg-bg-elevated px-3.5 text-[12.5px] font-bold text-text"
            >
              No, son recientes
            </button>
          </div>
        </div>
      )}

      {pregunta?.tipo === 'baja' && (
        <div className="mb-3 flex flex-col gap-2 rounded-xl bg-primary-soft/40 px-3.5 py-2.5">
          <p className="text-[12.5px] text-text">
            Bajaste la deuda {formatMXN(pregunta.diff)}. ¿Fue un pago?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const monto = pregunta.diff
                setPregunta(null)
                setEditing(false)
                onPagar?.(monto)
              }}
              className="min-h-[36px] rounded-full bg-primary-deep px-3.5 text-[12.5px] font-bold text-white"
            >
              Sí, registrar el pago
            </button>
            <button
              type="button"
              onClick={() => void save(true)}
              className="min-h-[36px] rounded-full border border-border bg-bg-elevated px-3.5 text-[12.5px] font-bold text-text"
            >
              No, sólo corregir el saldo
            </button>
          </div>
        </div>
      )}

      {isCredit && estado && !estado.sinCorte && !editing && (
        <LineaEstado estado={estado} onPagar={onPagar} onVerEstado={onVerEstado} />
      )}
    </div>
  )
}

/** Una línea con lo que toca del estado de cuenta y cómo resolverlo. */
function LineaEstado({
  estado,
  onPagar,
  onVerEstado,
}: {
  estado: EstadosTarjeta
  onPagar?: (monto?: number) => void
  onVerEstado?: () => void
}) {
  const p = estado.proximo
  const u = estado.ultimo
  const texto = p
    ? p.estado === 'vencido'
      ? `Venció el ${fechaCorta(p.vence)} · te faltan ${formatMXN(p.falta)}`
      : `Te faltan ${formatMXN(p.falta)} · vence ${fechaCorta(p.vence)}`
    : u && u.estado === 'pagado'
      ? `Estado del corte ${fechaCorta(u.corte)} pagado`
      : 'Nada pendiente de tu último estado de cuenta'
  return (
    <div className="-mt-1 mb-3 flex items-center gap-2 pl-[52px]">
      <p
        className={clsx(
          'min-w-0 flex-1 text-[12px] leading-snug',
          p?.estado === 'vencido' ? 'font-semibold text-debt-ink' : p ? 'text-text-secondary' : 'text-asset-ink',
        )}
      >
        {texto}
      </p>
      {onVerEstado && (
        <button type="button" onClick={onVerEstado} className="min-h-[32px] shrink-0 px-1 text-[12px] font-bold text-primary-deep">
          Estado
        </button>
      )}
      {p && onPagar && (
        <button
          type="button"
          onClick={() => onPagar()}
          className="min-h-[32px] shrink-0 rounded-full bg-primary-soft px-3 text-[12px] font-bold text-primary-deep"
        >
          Pagar
        </button>
      )}
    </div>
  )
}
