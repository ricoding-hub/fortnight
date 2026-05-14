import { type ReactNode } from 'react'
import { type Icon, IconMoodEmpty } from '@tabler/icons-react'

interface EmptyStateProps {
  icon?: Icon
  title: string
  description?: string
  /** Optional CTA rendered below the description. */
  action?: ReactNode
}

export function EmptyState({
  icon: IconComponent = IconMoodEmpty,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-14 text-center animate-[fade-in_400ms_ease-out]">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/8 text-primary">
        <IconComponent size={32} stroke={1.5} />
      </div>
      <h3 className="text-base font-semibold text-text">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-xs text-sm text-text-secondary">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
