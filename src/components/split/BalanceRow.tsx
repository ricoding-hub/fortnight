import { useState } from 'react'
import { IconChevronDown, IconChevronRight, IconCheck, IconPlus, IconArrowRight } from '@tabler/icons-react'
import clsx from 'clsx'
import { Avatar } from '@/components/ui/Avatar'
import { formatMXN } from '@/lib/format'
import type { BalanceEntry } from '@/hooks/usePeopleBalances'

interface BalanceRowProps {
  entry: BalanceEntry
  /** Home mode: whole row navigates, no expand, only name + amount. */
  compact?: boolean
  /** Open the person/group detail. */
  onOpen?: () => void
  /** Settle the whole relationship. */
  onSettle?: () => void
  /** Register a partial payment. */
  onAbonar?: () => void
}

function netColor(net: number): string {
  if (net > 0.005) return 'text-asset-deep'
  if (net < -0.005) return 'text-debt-deep'
  return 'text-text-tertiary'
}

/** First-person label for MY position with a person/group. */
function netLabel(entry: BalanceEntry): string {
  const abs = formatMXN(Math.abs(entry.net))
  if (Math.abs(entry.net) < 0.005) return 'En paz'
  const plural = entry.kind === 'group'
  if (entry.net > 0) return plural ? `Te deben ${abs}` : `Te debe ${abs}`
  return plural ? `Debes ${abs}` : `Le debes ${abs}`
}

/** Third-person label for a member's own position inside a group. */
function memberLabel(net: number): string {
  const abs = formatMXN(Math.abs(net))
  if (Math.abs(net) < 0.005) return 'En paz'
  return net > 0 ? `recupera ${abs}` : `debe ${abs}`
}

export function BalanceRow({ entry, compact = false, onOpen, onSettle, onAbonar }: BalanceRowProps) {
  const [expanded, setExpanded] = useState(false)
  const color = netColor(entry.net)
  const nameById = new Map((entry.memberBalances ?? []).map((m) => [m.id, m.name]))

  if (compact) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-xl bg-bg-elevated px-3 py-2.5 text-left shadow-card transition-transform active:scale-[0.98]"
      >
        <Avatar name={entry.name} avatarUrl={entry.avatarUrl} imageUrl={entry.imageUrl} isGroup={entry.kind === 'group'} size={36} />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-text">{entry.name}</span>
        <span className={clsx('shrink-0 font-mono text-[13px] font-extrabold tabular-nums', color)}>
          {netLabel(entry)}
        </span>
      </button>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl bg-bg-elevated shadow-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
      >
        <Avatar name={entry.name} avatarUrl={entry.avatarUrl} imageUrl={entry.imageUrl} isGroup={entry.kind === 'group'} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-extrabold text-text">{entry.name}</p>
          <p className={clsx('font-mono text-[12.5px] font-bold tabular-nums', color)}>{netLabel(entry)}</p>
        </div>
        {expanded ? (
          <IconChevronDown size={17} className="shrink-0 text-text-tertiary" />
        ) : (
          <IconChevronRight size={17} className="shrink-0 text-text-tertiary" />
        )}
      </button>

      {expanded && (
        <div className="animate-[slide-down_200ms_ease-out] border-t border-border px-3.5 pb-3 pt-2.5">
          {/* Per-member positions (3+ groups) */}
          {entry.kind === 'group' && entry.memberBalances && entry.memberBalances.length > 0 && (
            <ul className="mb-2 flex flex-col gap-1.5">
              {entry.memberBalances.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5">
                  <Avatar name={m.name} avatarUrl={m.avatarUrl} size={26} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text">{m.name}</span>
                  <span className={clsx('shrink-0 font-mono text-[11.5px] font-bold', netColor(m.net))}>
                    {memberLabel(m.net)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Pairwise transfers ("A debe X a B") */}
          {entry.edges && entry.edges.length > 0 && (
            <ul className="mb-2 flex flex-col gap-1 rounded-lg bg-bg-secondary/50 px-3 py-2">
              {entry.edges.map((e, i) => (
                <li key={i} className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
                  <span className="font-semibold text-text">{nameById.get(e.fromMemberId) ?? '—'}</span>
                  <IconArrowRight size={12} className="text-text-tertiary" />
                  <span className="font-semibold text-text">{nameById.get(e.toMemberId) ?? '—'}</span>
                  <span className="ml-auto font-mono font-bold text-text">{formatMXN(e.amount)}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {onAbonar && Math.abs(entry.net) > 0.005 && (
              <button
                type="button"
                onClick={onAbonar}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary/10 py-2 text-[12px] font-bold text-primary-deep transition-colors hover:bg-primary/20"
              >
                <IconPlus size={13} /> Abonar
              </button>
            )}
            {onSettle && Math.abs(entry.net) > 0.005 && (
              <button
                type="button"
                onClick={onSettle}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-asset/10 py-2 text-[12px] font-bold text-asset-deep transition-colors hover:bg-asset/20"
              >
                <IconCheck size={13} /> Saldar
              </button>
            )}
            {onOpen && (
              <button
                type="button"
                onClick={onOpen}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-bg-secondary py-2 text-[12px] font-bold text-text-secondary transition-colors hover:bg-border-strong"
              >
                Ver detalle
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
