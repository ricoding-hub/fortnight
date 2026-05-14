import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { IconTrendingUp, IconTrendingDown } from '@tabler/icons-react'
import { formatMXN } from '@/lib/format'

interface BalanceHeroProps {
  /** Net worth: total debit assets − total credit debt. */
  net: number
  /** Optional: previous period net for trend indicator. */
  previousNet?: number
}

/** Animated counter that counts up/down to the target. */
function useAnimatedValue(target: number, duration = 800) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const start = display
    const diff = target - start
    if (diff === 0) return

    const startTime = performance.now()
    let frame: number

    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(start + diff * eased)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration])

  return display
}

export function BalanceHero({ net, previousNet }: BalanceHeroProps) {
  const positive = net >= 0
  const animated = useAnimatedValue(net)
  const trend = previousNet != null ? net - previousNet : null

  return (
    <section
      className={clsx(
        'relative mx-4 mt-4 overflow-hidden rounded-2xl p-6 text-center shadow-elevated',
        positive ? 'gradient-hero-positive' : 'gradient-hero-negative',
      )}
    >
      {/* Decorative circles */}
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
      <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-white/8" />

      <p className="relative text-xs font-medium uppercase tracking-widest text-white/80">
        Balance neto
      </p>
      <p className="relative mt-2 text-4xl font-bold tabular-nums text-white animate-[count-up_600ms_ease-out]">
        {formatMXN(Math.round(animated))}
      </p>

      <div className="relative mt-2 flex items-center justify-center gap-1.5">
        {trend != null && trend !== 0 ? (
          <>
            {trend > 0 ? (
              <IconTrendingUp size={14} className="text-white/90" />
            ) : (
              <IconTrendingDown size={14} className="text-white/90" />
            )}
            <span className="text-xs font-medium text-white/80">
              {trend > 0 ? '+' : ''}
              {formatMXN(trend)} vs. periodo anterior
            </span>
          </>
        ) : (
          <span className="text-xs text-white/70">activos − deuda total</span>
        )}
      </div>
    </section>
  )
}
