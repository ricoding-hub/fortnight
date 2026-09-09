import { createElement, useState } from 'react'
import clsx from 'clsx'
import { bankLogoUrl } from '@/lib/banks'
import { EVENT_STYLE } from '@/components/calendar/eventStyle'
import type { CalendarEventKind } from '@/lib/calendar'
import type { Account } from '@/types'

interface AccountBadgeProps {
  /** The account behind the event, when there is one. */
  account?: Account
  kind: CalendarEventKind
  size?: number
  /** On the filled "today" cell the fallback icon must invert to stay legible. */
  onDark?: boolean
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * The face of a calendar event. When the event belongs to a configured account
 * it shows that bank's logo, because a logo is recognised instantly and a
 * colour has to be remembered. Falls back to the account's own colour with its
 * initials, and finally to the event-kind icon for things with no account
 * behind them (a payday, a goal).
 */
export function AccountBadge({ account, kind, size = 36, onDark = false }: AccountBadgeProps) {
  const [logoFailed, setLogoFailed] = useState(false)
  const style = EVENT_STYLE[kind]
  const box = { width: size, height: size }
  const radius = size >= 34 ? 'rounded-md' : size >= 20 ? 'rounded-lg' : 'rounded-[4px]'

  if (account?.logo_domain && !logoFailed) {
    return (
      <span
        style={box}
        className={clsx('grid shrink-0 place-items-center overflow-hidden bg-white shadow-sm', radius)}
      >
        <img
          src={bankLogoUrl(account.logo_domain)}
          alt={account.name}
          style={{ width: size * 0.68, height: size * 0.68 }}
          className="object-contain"
          onError={() => setLogoFailed(true)}
        />
      </span>
    )
  }

  if (account) {
    return (
      <span
        style={{ ...box, backgroundColor: account.color ?? '#6B7194' }}
        className={clsx('grid shrink-0 place-items-center font-bold text-white shadow-sm', radius)}
      >
        <span style={{ fontSize: size * 0.34 }}>{initialsOf(account.name)}</span>
      </span>
    )
  }

  return (
    <span
      style={
        onDark
          ? { ...box, background: 'rgba(255,255,255,0.22)', color: '#FFFFFF' }
          : { ...box, background: `${style.hex}18`, color: style.hex }
      }
      className={clsx('grid shrink-0 place-items-center', radius)}
    >
      {createElement(style.icon, { size: Math.max(9, Math.round(size * 0.6)), stroke: 2.4 })}
    </span>
  )
}
