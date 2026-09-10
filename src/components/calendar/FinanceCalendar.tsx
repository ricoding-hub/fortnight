import { createElement, useMemo, useState } from 'react'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import clsx from 'clsx'
import { Card } from '@/components/ui/Card'
import { DayDetailModal } from '@/components/calendar/DayDetailModal'
import { EVENT_STYLE, KIND_ORDER, PRIMARY_CELL, dominantPrimary } from '@/components/calendar/eventStyle'
import { DayMarkers } from '@/components/calendar/DayMarkers'
import {
  buildCalendarEvents, eventsByDay, monthGrid, noon,
  projectDailyBalance, toKey, WEEKDAYS_ES,
  type CalendarEventKind, type CalendarInput,
} from '@/lib/calendar'
import { formatMXN, formatMonthMX } from '@/lib/format'


interface FinanceCalendarProps extends CalendarInput {
  /** Liquid cash today — the starting point of the projection. */
  startCash: number
  onOpenAccount?: (accountId: string) => void
}

/**
 * Month view of everything the app knows is coming: paydays, card cuts and
 * payments, subscriptions and instalments. A day is coloured only by what you
 * plan around — payday, deadline, cut — and marked with the logo or icon of
 * whatever is happening on it. Days where the projection dips below zero are
 * called out, which is the whole reason to look at money on a calendar
 * instead of a list.
 */
export function FinanceCalendar({ startCash, onOpenAccount, ...data }: FinanceCalendarProps) {
  const today = useMemo(() => noon(new Date()), [])
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1, 12))
  const [selected, setSelected] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<CalendarEventKind>>(new Set())

  const accountById = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts])
  const grid = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor])
  const rangeFrom = grid[0]
  const rangeTo = grid[grid.length - 1]

  const allEvents = useMemo(
    () => buildCalendarEvents(data, rangeFrom, rangeTo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.accounts, data.installments, data.subscriptions, data.transactions, data.goals, data.config, rangeFrom, rangeTo],
  )
  const events = useMemo(
    () => allEvents.filter((e) => !hidden.has(e.kind)),
    [allEvents, hidden],
  )
  const byDay = useMemo(() => eventsByDay(events), [events])
  // The projection always uses every event: hiding a kind is a viewing filter,
  // not a way to pretend the money isn't leaving.
  const balances = useMemo(
    () => projectDailyBalance(allEvents, startCash, rangeFrom, rangeTo, today),
    [allEvents, startCash, rangeFrom, rangeTo, today],
  )

  const presentKinds = useMemo(() => {
    const s = new Set(allEvents.map((e) => e.kind))
    return KIND_ORDER.filter((k) => s.has(k))
  }, [allEvents])

  const monthKey = `${cursor.getFullYear()}-${cursor.getMonth()}`
  const todayKey = toKey(today)
  const monthTotals = useMemo(() => {
    let inflow = 0
    let outflow = 0
    for (const e of allEvents) {
      if (!e.countsToCash) continue
      if (e.date.slice(0, 7) !== toKey(cursor).slice(0, 7)) continue
      if (e.amount > 0) inflow += e.amount
      else outflow -= e.amount
    }
    return { inflow, outflow }
  }, [allEvents, cursor])

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1, 12))
    setSelected(null)
  }

  function toggleKind(k: CalendarEventKind) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  return (
    <Card className="p-0">
      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Mes anterior"
          className="grid h-8 w-8 place-items-center rounded-md bg-bg-secondary text-text-secondary transition-transform hover:text-text active:scale-90"
        >
          <IconChevronLeft size={17} />
        </button>
        <div className="text-center">
          <p className="text-[13px] font-extrabold capitalize text-text">{formatMonthMX(cursor)}</p>
          <p className="mt-px font-mono text-[10px] font-bold tabular-nums text-text-tertiary">
            <span className="text-asset-deep">+{formatMXN(monthTotals.inflow)}</span>
            {'  '}
            <span className="text-debt-deep">−{formatMXN(monthTotals.outflow)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Mes siguiente"
          className="grid h-8 w-8 place-items-center rounded-md bg-bg-secondary text-text-secondary transition-transform hover:text-text active:scale-90"
        >
          <IconChevronRight size={17} />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 px-2">
        {WEEKDAYS_ES.map((w) => (
          <span
            key={w}
            className="py-1 text-center text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-text-tertiary"
          >
            {w}
          </span>
        ))}
      </div>

      {/* Day grid — re-keyed per month so the stagger replays on navigation */}
      <div key={monthKey} className="grid grid-cols-7 gap-0.5 px-2 pb-2">
        {grid.map((day, i) => {
          const key = toKey(day)
          const inMonth = day.getMonth() === cursor.getMonth()
          const isToday = key === todayKey
          const dayEvents = byDay.get(key) ?? []
          const projected = balances.get(key)
          const negative = projected != null && projected < 0 && key >= todayKey
          // The cell's colour belongs to the dates you plan around; everything
          // else is context and leaves the background alone.
          const primary = dominantPrimary(dayEvents.map((e) => e.kind))
          const cell = primary ? PRIMARY_CELL[primary] : null

          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              aria-label={`${day.getDate()} — ${dayEvents.length} eventos`}
              style={{ animation: `fade-in 220ms ease-out ${Math.min(i * 6, 220)}ms both` }}
              className={clsx(
                'relative flex aspect-square flex-col items-center justify-start gap-0.5 rounded-md pt-1 transition-transform active:scale-90',
                !inMonth && 'opacity-35',
                cell && `${cell.bg} ring-1 ${cell.ring}`,
                !cell && negative && 'bg-debt-soft/60',
                // Today is an outline, not a fill: filling it hid the colour of
                // its own payday or deadline.
                isToday && 'ring-2 ring-primary ring-offset-1 ring-offset-bg-elevated',
              )}
            >
              <span
                className={clsx(
                  'font-mono text-[11px] font-bold tabular-nums',
                  cell ? cell.text : negative ? 'text-debt-deep' : isToday ? 'text-primary-deep' : 'text-text',
                )}
              >
                {day.getDate()}
              </span>
              <DayMarkers events={dayEvents} accountById={accountById} size={14} max={3} />
            </button>
          )
        })}
      </div>

      {/* Legend doubles as a filter */}
      {presentKinds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2.5">
          {presentKinds.map((k) => {
            const st = EVENT_STYLE[k]
            const off = hidden.has(k)
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                aria-pressed={!off}
                className={clsx(
                  'flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold transition-all active:scale-95',
                  off ? 'bg-bg-secondary text-text-tertiary opacity-60' : st.chip,
                )}
              >
                {createElement(st.icon, { size: 11, stroke: 2.2 })}
                {st.label}
              </button>
            )
          })}
        </div>
      )}

      <DayDetailModal
        open={selected != null}
        onClose={() => setSelected(null)}
        dayKey={selected}
        events={selected ? byDay.get(selected) ?? [] : []}
        projected={selected ? balances.get(selected) : undefined}
        accounts={data.accounts}
        onOpenAccount={onOpenAccount}
      />
    </Card>
  )
}
