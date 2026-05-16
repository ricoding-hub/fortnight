import { useState } from 'react'
import { IconChevronRight, IconSparkles } from '@tabler/icons-react'
import { richetoAdvice, type AdviceTip } from '@/lib/advice'
import { Richeto } from '@/components/Richeto'
import type { BucketWithSpend } from '@/lib/plan'
import type { Goal } from '@/types'

interface RichetoAdviceCardProps {
  buckets: BucketWithSpend[]
  monthlyIncome: number
  goals: Goal[]
  /** Fires when the user taps the tip's CTA. */
  onAction?: (tip: AdviceTip) => void
}

/** White card with left accent stripe + Richeto + tip carousel. Hidden when no tips. */
export function RichetoAdviceCard({
  buckets,
  monthlyIncome,
  goals,
  onAction,
}: RichetoAdviceCardProps) {
  const tips = richetoAdvice(buckets, monthlyIncome, goals)
  const [idx, setIdx] = useState(0)

  if (tips.length === 0) return null
  const tip = tips[idx % tips.length]

  return (
    <div className="px-4 pb-1 pt-2">
      <div className="relative overflow-hidden rounded-lg bg-bg-elevated p-3.5 shadow-card">
        {/* Accent stripe */}
        <div
          className="absolute bottom-0 left-0 top-0 w-1"
          style={{ background: tip.color }}
        />

        <div className="flex items-start gap-3 pl-1">
          {/* Richeto + sparkle badge */}
          <div className="relative shrink-0">
            <Richeto size={48} />
            <span
              className="absolute -bottom-0.5 -right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full"
              style={{
                background: tip.color,
                boxShadow: '0 0 0 2px var(--color-bg-elevated)',
              }}
            >
              <IconSparkles size={10} stroke={2.25} color="#fff" />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center gap-1.5">
              <span
                className="text-[10px] font-extrabold uppercase tracking-[0.08em]"
                style={{ color: tip.color }}
              >
                Richeto sugiere
              </span>
              {tips.length > 1 && (
                <span className="font-mono text-[9.5px] font-bold text-text-tertiary">
                  {(idx % tips.length) + 1}/{tips.length}
                </span>
              )}
            </div>
            <p className="text-[13.5px] font-extrabold leading-tight text-text">
              {tip.title}
            </p>
            <p className="mt-1 text-[12px] font-medium leading-snug text-text-secondary">
              {tip.body}
            </p>
            <div className="mt-2.5 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onAction?.(tip)}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-extrabold text-white transition-transform active:scale-[0.97]"
                style={{ background: tip.color }}
              >
                {tip.action}
                <IconChevronRight size={11} stroke={2.5} />
              </button>
              {tips.length > 1 && (
                <button
                  type="button"
                  onClick={() => setIdx((i) => i + 1)}
                  className="rounded-full bg-bg-secondary px-2.5 py-1.5 text-[11px] font-bold text-text-secondary transition-colors hover:bg-bg-tinted"
                >
                  Siguiente
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
