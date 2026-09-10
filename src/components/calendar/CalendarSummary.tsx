import { useMemo } from 'react'
import { IconChevronRight } from '@tabler/icons-react'
import clsx from 'clsx'
import { Card } from '@/components/ui/Card'
import { AccountBadge } from '@/components/calendar/AccountBadge'
import { DayMarkers } from '@/components/calendar/DayMarkers'
import {
  buildCalendarEvents, eventsByDay, fromKey, noon, toKey, WEEKDAYS_ES,
  type CalendarInput,
} from '@/lib/calendar'
import { formatMXN } from '@/lib/format'

interface CalendarSummaryProps extends CalendarInput {
  /** How many upcoming events to list. */
  limit?: number
  onOpen: () => void
}

const DAY_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export function CalendarSummary({ limit = 4, onOpen, ...data }: CalendarSummaryProps) {
  const today = useMemo(() => noon(new Date()), [])
  const accountById = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts])

  const { week, byDay, upcoming } = useMemo(() => {
    // Sunday of the current week through the next 45 days, so the strip and the
    // upcoming list come from one pass over the same events.
    const sunday = noon(new Date(today))
    sunday.setDate(today.getDate() - today.getDay())
    const to = noon(new Date(today))
    to.setDate(today.getDate() + 45)

    const all = buildCalendarEvents(data, sunday, to)
    const todayKey = toKey(today)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = noon(new Date(sunday))
      d.setDate(sunday.getDate() + i)
      return d
    })
    return {
      week: days,
      byDay: eventsByDay(all),
      upcoming: all
        .filter((e) => e.date >= todayKey && e.kind !== 'transaction')
        .slice(0, limit),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.accounts, data.installments, data.subscriptions, data.transactions, data.goals, data.config, today, limit])

  const weekHasEvents = week.some((d) => (byDay.get(toKey(d)) ?? []).length > 0)
  if (!weekHasEvents && upcoming.length === 0) return null

  const todayKey = toKey(today)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left transition-transform active:scale-[0.985]"
    >
      <Card className="p-0">
        {/* Esta semana */}
        <div className="flex items-center justify-between px-4 pt-3.5">
          <p className="text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-text-tertiary">
            Esta semana
          </p>
          <IconChevronRight size={15} className="shrink-0 text-text-tertiary" />
        </div>
        <div className="grid grid-cols-7 gap-0.5 px-2 pb-1 pt-1.5">
          {week.map((d) => {
            const key = toKey(d)
            const isToday = key === todayKey
            const dayEvents = byDay.get(key) ?? []
            return (
              <span
                key={key}
                className={clsx(
                  'flex flex-col items-center gap-0.5 rounded-md py-1.5',
                  isToday && 'bg-primary text-white shadow-card',
                )}
              >
                <span
                  className={clsx(
                    'text-[8.5px] font-extrabold uppercase tracking-[0.04em]',
                    isToday ? 'text-white/70' : 'text-text-tertiary',
                  )}
                >
                  {WEEKDAYS_ES[d.getDay()]}
                </span>
                <span
                  className={clsx(
                    'font-mono text-[12px] font-bold tabular-nums',
                    isToday ? 'text-white' : 'text-text',
                  )}
                >
                  {d.getDate()}
                </span>
                <DayMarkers
                  events={dayEvents}
                  accountById={accountById}
                  size={13}
                  max={2}
                  demoteSecondary
                />
              </span>
            )
          })}
        </div>

        {/* Próximos pagos */}
        {upcoming.length > 0 && (
          <ul className="flex flex-col gap-1.5 border-t border-border px-3 pb-3 pt-2.5">
            {upcoming.map((e) => {
              const d = fromKey(e.date)
              const isToday = e.date === todayKey
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
