import { AccountBadge } from '@/components/calendar/AccountBadge'
import { KIND_ORDER } from '@/components/calendar/eventStyle'
import type { CalendarEvent } from '@/lib/calendar'
import type { Account } from '@/types'

interface DayMarkersProps {
  events: CalendarEvent[]
  accountById: Map<string, Account>
  /** Badge edge in px. Three of these plus gaps must fit a 46px cell. */
  size?: number
  max?: number
  /** Sitting on the primary-filled "today" cell, so icons need to invert. */
  onDark?: boolean
}

/**
 * The row of little faces under a day number. Shared by the month grid and
 * Home's week strip so the two can never disagree about what a day looks like.
 *
 * One marker per distinct event kind rather than per event: a day with three
 * subscriptions should read as "subscriptions", not as a wall of identical
 * chips. Card events keep their own account, so two different cards due on the
 * same day still show two different logos.
 */
export function DayMarkers({ events, accountById, size = 14, max = 3, onDark = false }: DayMarkersProps) {
  if (events.length === 0) return null

  // Dedupe by kind, but keep card events distinct per account.
  const seen = new Set<string>()
  const picked: CalendarEvent[] = []
  for (const kind of KIND_ORDER) {
    for (const e of events) {
      if (e.kind !== kind) continue
      const key = e.accountId ? `${e.kind}:${e.accountId}` : e.kind
      if (seen.has(key)) continue
      seen.add(key)
      picked.push(e)
      if (picked.length >= max) break
    }
    if (picked.length >= max) break
  }

  const extra = events.length - picked.length

  return (
    <span className="flex items-center justify-center gap-px">
      {picked.map((e) => (
        <AccountBadge
          key={e.id}
          account={e.accountId ? accountById.get(e.accountId) : undefined}
          kind={e.kind}
          size={size}
          onDark={onDark}
        />
      ))}
      {extra > 0 && (
        <span
          className={onDark ? 'text-[8px] font-bold text-white/80' : 'text-[8px] font-bold text-text-tertiary'}
        >
          +{extra}
        </span>
      )}
    </span>
  )
}
