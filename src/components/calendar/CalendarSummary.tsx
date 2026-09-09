import { useMemo } from 'react'
import { IconChevronRight } from '@tabler/icons-react'
import clsx from 'clsx'
import { Card } from '@/components/ui/Card'
import { AccountBadge } from '@/components/calendar/AccountBadge'
import {
  buildCalendarEvents, cycleSummary, fromKey, noon, toKey, type CalendarInput,
} from '@/lib/calendar'
import { formatMXN } from '@/lib/format'

interface CalendarSummaryProps extends CalendarInput {
  startCash: number
  /** How many upcoming events to list. */
  limit?: number
  onOpen: () => void
}

const DAY_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MON_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "jue 17 sep" — spelled out, so the deadline is never a guess. */
function fmtDay(key: string): string {
  const d = fromKey(key)
  return `${DAY_ES[d.getDay()]} ${d.getDate()} ${MON_ES[d.getMonth()]}`
}

/**
 * Home's window into the calendar: what's left this pay cycle and the next few
 * dated things. Tapping anywhere opens the full calendar in Proyección.
 */
export function CalendarSummary({ startCash, limit = 4, onOpen, ...data }: CalendarSummaryProps) {
  const today = useMemo(() => noon(new Date()), [])
  const accountById = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts])

  const { upcoming, cycle } = useMemo(() => {
    const to = new Date(today)
    to.setDate(to.getDate() + 45)
    const all = buildCalendarEvents(data, today, to)
    const todayKey = toKey(today)
    return {
      upcoming: all
        .filter((e) => e.date >= todayKey && e.kind !== 'transaction')
        .slice(0, limit),
      cycle: cycleSummary(all, data.config, startCash, today),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.accounts, data.installments, data.subscriptions, data.transactions, data.goals, data.config, startCash, today, limit])

  if (!cycle && upcoming.length === 0) return null

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left transition-transform active:scale-[0.985]"
    >
      <Card className="p-0">
        {cycle && (
          <div className="flex items-center gap-3 px-4 pt-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-text-tertiary">
                Te queda hasta el {fmtDay(cycle.to)}
              </p>
              <p
                className={clsx(
                  'mt-0.5 font-display text-[26px] font-extrabold leading-none tabular-nums',
                  cycle.safeToSpend < 0 ? 'text-debt-deep' : 'text-text',
                )}
              >
                {formatMXN(cycle.safeToSpend)}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-text-secondary">
                {cycle.days} {cycle.days === 1 ? 'día' : 'días'} ·{' '}
                {cycle.committed > 0 ? (
                  <>
                    <span className="font-mono font-bold tabular-nums text-debt-deep">
                      {formatMXN(cycle.committed)}
                    </span>{' '}
                    comprometido
                  </>
                ) : (
                  'sin pagos comprometidos'
                )}
              </p>
            </div>
            <IconChevronRight size={17} className="shrink-0 text-text-tertiary" />
          </div>
        )}

        {upcoming.length > 0 && (
          <ul className={clsx('flex flex-col gap-1.5 px-3 pb-3', cycle ? 'pt-3' : 'pt-3.5')}>
            {upcoming.map((e) => {
              const d = fromKey(e.date)
              const isToday = e.date === toKey(today)
              return (
                <li key={e.id} className="flex items-center gap-2.5">
                  <AccountBadge account={accountById.get(e.accountId ?? '')} kind={e.kind} size={28} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text">
                    {e.title}
                  </span>
                  <span
                    className={clsx(
                      'shrink-0 font-mono text-[10px] font-bold tabular-nums',
                      isToday ? 'text-primary-deep' : 'text-text-tertiary',
                    )}
                  >
                    {isToday ? 'hoy' : `${DAY_ES[d.getDay()]} ${d.getDate()}`}
                  </span>
                  {e.amount !== 0 && (
                    <span
                      className={clsx(
                        'w-[74px] shrink-0 text-right font-mono text-[11.5px] font-bold tabular-nums',
                        e.amount > 0 ? 'text-asset-deep' : 'text-debt-deep',
                      )}
                    >
                      {e.amount > 0 ? '+' : '−'}
                      {formatMXN(Math.abs(e.amount))}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </button>
  )
}
