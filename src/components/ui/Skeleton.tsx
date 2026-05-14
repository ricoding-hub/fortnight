import clsx from 'clsx'

interface SkeletonProps {
  className?: string
}

/** Shimmer placeholder shown while data loads. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={clsx('rounded-lg shimmer', className)}
      aria-hidden="true"
    />
  )
}

/** Pre-composed skeleton for a stat card. */
export function SkeletonStatCard() {
  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-4">
      <Skeleton className="mb-2 h-3 w-20" />
      <Skeleton className="h-6 w-28" />
    </div>
  )
}

/** Pre-composed skeleton for a transaction row. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-4 w-16" />
    </div>
  )
}
