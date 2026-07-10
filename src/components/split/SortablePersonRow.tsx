import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { IconGripVertical, IconUsers } from '@tabler/icons-react'
import clsx from 'clsx'
import { Card } from '@/components/ui/Card'
import { nameColorClass } from '@/lib/avatarColors'

interface SortablePersonRowProps {
  id: string
  name: string
  net: number
  netLabel: string
  avatarUrl?: string
  /** Render a group icon fallback instead of initials. */
  group?: boolean
}

/** Compact draggable row shown in reorder mode — detail collapsed for easy sorting. */
export function SortablePersonRow({ id, name, net, netLabel, avatarUrl, group }: SortablePersonRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-none">
      <Card
        className={clsx(
          'flex items-center gap-3 px-4 py-3 transition-shadow',
          isDragging && 'shadow-lift ring-2 ring-primary/30',
        )}
      >
        <IconGripVertical size={18} className="shrink-0 text-text-tertiary" />
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="h-9 w-9 shrink-0 rounded-xl object-cover" />
        ) : group ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lavender-soft text-lavender-deep">
            <IconUsers size={17} stroke={2} />
          </div>
        ) : (
          <div
            className={clsx(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold',
              nameColorClass(name),
            )}
          >
            {(name[0] ?? '?').toUpperCase()}
          </div>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{name}</span>
        <span
          className={clsx(
            'shrink-0 font-mono text-[12px] font-bold tabular-nums',
            net > 0 ? 'text-asset-deep' : net < 0 ? 'text-debt-deep' : 'text-text-tertiary',
          )}
        >
          {netLabel}
        </span>
      </Card>
    </div>
  )
}
