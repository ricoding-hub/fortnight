import { IconUsers } from '@tabler/icons-react'
import clsx from 'clsx'
import { nameColorClass } from '@/lib/avatarColors'

interface AvatarProps {
  name: string
  /** Person photo (linked profile). */
  avatarUrl?: string | null
  /** Group photo. */
  imageUrl?: string | null
  /** Render the group fallback icon instead of initials when no image. */
  isGroup?: boolean
  /** Square size in px (default 36). */
  size?: number
  className?: string
}

/**
 * Photo-or-initials avatar, the single source for the pattern that used to be
 * inlined across the loans/split screens. Falls back to a colored initial
 * (people) or a group icon (groups) when there's no image.
 */
export function Avatar({ name, avatarUrl, imageUrl, isGroup = false, size = 36, className }: AvatarProps) {
  const url = avatarUrl ?? imageUrl
  const style = { width: size, height: size }
  const radius = size >= 40 ? 'rounded-2xl' : 'rounded-xl'

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={style}
        className={clsx('shrink-0 object-cover', radius, className)}
      />
    )
  }

  if (isGroup) {
    return (
      <div
        style={style}
        className={clsx('flex shrink-0 items-center justify-center bg-lavender-soft text-lavender-deep', radius, className)}
      >
        <IconUsers size={Math.round(size * 0.5)} stroke={2} />
      </div>
    )
  }

  return (
    <div
      style={style}
      className={clsx(
        'flex shrink-0 items-center justify-center font-bold',
        radius,
        nameColorClass(name),
        className,
      )}
    >
      <span style={{ fontSize: Math.round(size * 0.4) }}>{(name[0] ?? '?').toUpperCase()}</span>
    </div>
  )
}
