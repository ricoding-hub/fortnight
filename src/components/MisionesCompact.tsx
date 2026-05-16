import { createElement } from 'react'
import { IconCheck, type Icon } from '@tabler/icons-react'
import clsx from 'clsx'

export interface Mission {
  id: string
  title: string
  /** Progress count toward `total`. */
  progress: number
  total: number
  /** Reward XP shown in the pill. */
  reward: number
  /** Tabler icon component. */
  icon: Icon
  /** Accent hex colour — drives icon tile, bar, and reward pill. */
  color: string
}

interface MisionesCompactProps {
  missions: Mission[]
  /** Toggle handler for marking a mission complete. */
  onToggle?: (id: string) => void
  /** Optional override of completion (e.g. optimistic UI). */
  completedId?: string | null
}

export function MisionesCompact({ missions, onToggle, completedId }: MisionesCompactProps) {
  return (
    <div className="flex flex-col gap-2">
      {missions.map((q) => {
        const pct = q.total > 0 ? q.progress / q.total : 0
        const done = pct >= 1 || completedId === q.id

        return (
          <button
            key={q.id}
            type="button"
            onClick={() => onToggle?.(q.id)}
            className={clsx(
              'flex w-full items-center gap-3 rounded-md bg-bg-elevated px-3 py-2.5 text-left shadow-card transition-opacity',
              done && 'opacity-70',
            )}
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md"
              style={{ background: done ? q.color : q.color + '1a' }}
            >
              {done ? (
                <IconCheck size={18} stroke={2.25} color="#fff" />
              ) : (
                createElement(q.icon, { size: 18, stroke: 2, color: q.color })
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={clsx(
                  'text-[12.5px] font-bold text-text',
                  done && 'line-through',
                )}
              >
                {q.title}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <div
                  className="h-1 flex-1 overflow-hidden rounded-full"
                  style={{ background: q.color + '1a' }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-400"
                    style={{
                      width: `${done ? 100 : Math.min(pct * 100, 100)}%`,
                      background: q.color,
                    }}
                  />
                </div>
                <span className="font-mono text-[10px] font-bold text-text-tertiary">
                  {done ? q.total : q.progress}/{q.total}
                </span>
              </div>
            </div>
            <span
              className="shrink-0 rounded-full px-2 py-1 font-mono text-[11px] font-bold"
              style={{ color: q.color, background: q.color + '1a' }}
            >
              +{q.reward}xp
            </span>
          </button>
        )
      })}
    </div>
  )
}
