import clsx from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { formatMXN, formatDateGroupMX } from '@/lib/format'
import { EVENT_STYLE, KIND_ORDER } from '@/components/calendar/eventStyle'
import { AccountBadge } from '@/components/calendar/AccountBadge'
import type { CalendarEvent } from '@/lib/calendar'
import type { Account } from '@/types'

interface DayDetailModalProps {
  open: boolean
  onClose: () => void
  /** Local `YYYY-MM-DD`, or null when nothing is selected. */
  dayKey: string | null
  events: CalendarEvent[]
  /** Projected liquid balance at the end of this day. */
  projected?: number
  /** Configured accounts, so events can show their bank's logo. */
  accounts?: Account[]
  onOpenAccount?: (accountId: string) => void
}

/** Everything happening on one day, and what it leaves you with. */
export function DayDetailModal({
  open, onClose, dayKey, events, projected, accounts = [], onOpenAccount,
}: DayDetailModalProps) {
  if (!dayKey) return null
  const accountById = new Map(accounts.map((a) => [a.id, a]))

  const sorted = [...events].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  )
  const cash = sorted.filter((e) => e.countsToCash)
  const inflow = cash.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0)
  const outflow = cash.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0)

  return (
    <Modal open={open} onClose={onClose} title={formatDateGroupMX(dayKey)}>
      <div className="flex flex-col gap-4">
        {(inflow > 0 || outflow > 0 || projected != null) && (
          <div className="grid grid-cols-3 gap-2">
            <Tally label="Entra" value={inflow} tone="asset" />
            <Tally label="Sale" value={outflow} tone="debt" />
            {projected != null && <Tally label="Te queda" value={projected} tone="neutral" />}
          </div>
        )}

        {sorted.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[12.5px] text-text-tertiary">
            Nada agendado este día.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((e) => {
              const st = EVENT_STYLE[e.kind]
              const clickable = e.accountId && onOpenAccount
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => e.accountId && onOpenAccount?.(e.accountId)}
                    className={clsx(
                      'flex w-full items-center gap-3 rounded-md bg-bg-elevated px-3 py-2.5 text-left shadow-card transition-transform',
                      clickable && 'active:scale-[0.99]',
                    )}
                  >
                    <AccountBadge account={accountById.get(e.accountId ?? '')} kind={e.kind} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-text">{e.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1">
                        {e.tags.map((t) => (
                          <span
                            key={t}
                            className={clsx(
                              'rounded-full px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.04em]',
                              st.chip,
                            )}
                          >
                            {t}
                          </span>
                        ))}
                        {e.estimated && (
                          <span className="rounded-full bg-bg-secondary px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.04em] text-text-tertiary">
                            Estimado
                          </span>
                        )}
                      </span>
                    </span>
                    {e.amount !== 0 && (
                      <span
                        className={clsx(
                          'shrink-0 font-mono text-[13px] font-bold tabular-nums',
                          e.amount > 0 ? 'text-asset-deep' : 'text-debt-deep',
                        )}
                      >
                        {e.amount > 0 ? '+' : '−'}
                        {formatMXN(Math.abs(e.amount))}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {sorted.some((e) => !e.countsToCash && e.amount !== 0) && (
          <p className="rounded-md bg-bg-secondary px-3.5 py-2.5 text-[11px] leading-snug text-text-secondary">
            Lo que se carga a una tarjeta no sale de tu efectivo ese día: se paga
            junto con la tarjeta en su fecha de pago, así que no lo contamos dos veces.
          </p>
        )}
      </div>
    </Modal>
  )
}

function Tally({ label, value, tone }: { label: string; value: number; tone: 'asset' | 'debt' | 'neutral' }) {
  const color =
    tone === 'asset' ? 'text-asset-deep' : tone === 'debt' ? 'text-debt-deep' : 'text-text'
  return (
    <div className="rounded-md bg-bg-secondary/60 px-2.5 py-2">
      <p className="text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-text-tertiary">{label}</p>
      <p className={clsx('mt-0.5 font-mono text-[13px] font-bold tabular-nums', color)}>
        {formatMXN(value)}
      </p>
    </div>
  )
}
