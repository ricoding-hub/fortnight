import { AccountBadge } from '@/components/calendar/AccountBadge'
import { KIND_ORDER, tierOf } from '@/components/calendar/eventStyle'
import type { CalendarEvent } from '@/lib/calendar'
import type { Account } from '@/types'

interface DayMarkersProps {
  events: CalendarEvent[]
  accountById: Map<string, Account>
  /** Edge of a primary badge in px. Lesser tiers derive from it. */
  size?: number
  max?: number
}

/**
 * The row of little faces under a day number. Shared by the month grid and
 * Home's week strip so the two can never disagree about what a day looks like.
 *
 * Every marker draws something recognisable — a bank logo where there is one,
 * an icon otherwise. Coloured dots were dropped: they only said "something
 * happens here", which the day number already implied, and they made a manual
 * movement look identical to a subscription charge.
 *
 * One marker per distinct event kind rather than per event, so a day with
 * three subscriptions reads as "subscriptions" instead of a wall of chips.
 * Card events stay distinct per account — two cards due the same day are two
 * different problems — but movements collapse into a single neutral mark no
 * matter how many accounts they touch.
 */
export function DayMarkers({ events, accountById, size = 14, max = 3 }: DayMarkersProps) {
  if (events.length === 0) return null

  // KIND_ORDER runs most consequential first, so the slots fill with paydays,
  // deadlines and cuts before anything else can claim one.
  const seen = new Set<string>()
  const ordered: CalendarEvent[] = []
  for (const kind of KIND_ORDER) {
    for (const e of events) {
      if (e.kind !== kind) continue
      const key = e.accountId && tierOf(e.kind) !== 'movement' ? `${e.kind}:${e.accountId}` : e.kind
      if (seen.has(key)) continue
      seen.add(key)
      ordered.push(e)
    }
  }

  // A "+N" counter needs room of its own, so it costs a slot rather than
  // overflowing the cell.
  const budget = ordered.length > max ? max - 1 : max
  const picked = ordered.slice(0, budget)
  const extra = events.length - picked.length

  // A cell is about 46px wide at the 380px baseline, so the marks trade size
  // for room: a day with one thing happening shows it big, a crowded day
  // shrinks rather than spilling out of its cell.
  const base = picked.length >= 3 ? size - 2 : picked.length === 1 ? size + 3 : size

  return (
    <span className="flex items-center justify-center gap-px">
      {picked.map((e) => {
        const tier = tierOf(e.kind)
        return (
          <AccountBadge
            key={e.id}
            // A movement keeps the neutral kind icon even when it belongs to a
            // card: lending it the bank's logo would give yesterday's coffee
            // the same weight as the payment deadline.
            account={tier === 'movement' ? undefined : e.accountId ? accountById.get(e.accountId) : undefined}
            kind={e.kind}
            size={tier === 'primary' ? base : tier === 'secondary' ? base - 2 : base - 3}
            muted={tier === 'movement'}
          />
        )
      })}
      {extra > 0 && <span className="text-[8px] font-bold text-text-tertiary">+{extra}</span>}
    </span>
  )
}
