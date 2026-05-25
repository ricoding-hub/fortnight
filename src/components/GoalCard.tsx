import { createElement } from 'react'
import { IconArrowDown, IconArrowUp, IconLink, IconPencil } from '@tabler/icons-react'
import clsx from 'clsx'
import { Card } from '@/components/ui/Card'
import { iconFor } from '@/lib/icons'
import { expectedToday, monthsToGoal } from '@/lib/goals'
import { useAccounts } from '@/hooks/useAccounts'
import type { Goal } from '@/types'

interface GoalCardProps {
  goal: Goal
  onEdit?: (goal: Goal) => void
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi)
}

/** Tiny SVG ring with a centred icon — used for the goal progress visual. */
function ProgressRing({
  pct,
  color,
  trackColor,
  size = 56,
  stroke = 6,
  children,
}: {
  pct: number
  color: string
  trackColor: string
  size?: number
  stroke?: number
  children: React.ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - clamp(pct, 0, 1))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.4, 1.6, 0.5, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

/** Short Spanish month label like "dic 2026". */
function fmtDeadline(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T12:00:00')
  if (isNaN(d.getTime())) return '—'
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

export function GoalCard({ goal, onEdit }: GoalCardProps) {
  const { data: accounts } = useAccounts()
  const color = goal.color ?? '#2A4BFF'
  const pct = goal.target > 0 ? clamp(goal.saved / goal.target, 0, 1) : 0
  const expected = expectedToday(goal)
  const expectedPct = goal.target > 0 ? clamp(expected / goal.target, 0, 1) : 0
  const delta = goal.saved - expected
  const ahead = delta > 0
  const monthsLeft = monthsToGoal(goal)
  const linkedAccounts = accounts.filter((a) => goal.linked_account_ids.includes(a.id))

  return (
    <Card className="relative p-3.5">
      {onEdit && (
        <button
          type="button"
          onClick={() => onEdit(goal)}
          aria-label={`Editar ${goal.name}`}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-bg-secondary text-text-secondary transition-all hover:bg-primary/10 hover:text-primary active:scale-90"
        >
          <IconPencil size={13} stroke={2} />
        </button>
      )}
      <div className="flex items-center gap-3 pr-7">
        <ProgressRing pct={pct} color={color} trackColor={color + '22'}>
          {createElement(iconFor(goal.icon), { size: 22, stroke: 2, color })}
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-1.5">
            <span className="truncate text-sm font-extrabold text-text">{goal.name}</span>
            {goal.is_debt && (
              <span className="rounded-full bg-debt-soft px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-debt-deep">
                DEUDA
              </span>
            )}
          </div>
          <div className="font-mono text-xs font-semibold text-text-secondary">
            ${Math.round(goal.saved).toLocaleString()} de $
            {Math.round(goal.target).toLocaleString()}
          </div>
          <div className="mt-0.5 text-[10.5px] text-text-tertiary">
            <b style={{ color }}>${Math.round(goal.monthly).toLocaleString()}/mes</b> ·{' '}
            {Number.isFinite(monthsLeft) ? `${monthsLeft} meses` : '∞ meses'} · meta{' '}
            {fmtDeadline(goal.deadline)}
          </div>
        </div>
      </div>

      {linkedAccounts.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <IconLink size={11} className="text-text-tertiary" />
          {linkedAccounts.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: (a.color ?? color) + '20', color: a.color ?? color }}
            >
              {a.name}
            </span>
          ))}
        </div>
      )}

      {/* Plan vs Real layered bar */}
      <div className="mt-3">
        <div
          className="relative h-2.5 overflow-visible rounded-full"
          style={{ background: color + '22' }}
        >
          {!goal.is_debt && (
            <div
              className="absolute -top-1 -bottom-1 z-10 w-0.5 rounded-[2px] bg-text-secondary"
              style={{ left: `${expectedPct * 100}%` }}
            >
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-text px-1.5 py-px font-mono text-[8.5px] font-extrabold tracking-wide text-text-inverse">
                PLAN
              </div>
            </div>
          )}
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-[width] duration-700"
            style={{ width: `${pct * 100}%`, background: color }}
          />
        </div>

        {!goal.is_debt && (
          <div className="mt-2 flex items-center justify-between">
            <div className="font-mono text-[10.5px] text-text-tertiary">
              Esperado:{' '}
              <b className="text-text-secondary">${Math.round(expected).toLocaleString()}</b>
            </div>
            <div
              className={clsx(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10.5px] font-extrabold',
                ahead ? 'bg-asset-soft text-asset-deep' : 'bg-debt-soft text-debt-deep',
              )}
            >
              {ahead ? (
                <IconArrowUp size={10} stroke={2.5} />
              ) : (
                <IconArrowDown size={10} stroke={2.5} />
              )}
              {ahead ? '+' : '−'}${Math.abs(Math.round(delta)).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
