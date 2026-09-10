import { IconSparkles } from '@tabler/icons-react'
import clsx from 'clsx'

/**
 * Marks a feature that exists but isn't switched on yet. Lavender is the app's
 * "meta" family — it reads as a promise rather than as a warning or an error.
 *
 * `tone="onColor"` is the same label sitting on a saturated hero, where the
 * lavender pair would lose its contrast.
 */
export function ComingSoonBadge({
  tone = 'default',
  className,
}: {
  tone?: 'default' | 'onColor'
  className?: string
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.06em]',
        tone === 'onColor' ? 'bg-white/20 text-white' : 'bg-lavender-soft text-lavender-deep',
        className,
      )}
    >
      <IconSparkles size={10} stroke={2.6} />
      Próximamente
    </span>
  )
}
