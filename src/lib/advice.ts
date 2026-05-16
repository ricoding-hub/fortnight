/**
 * Richeto advice engine — port of design_handoff_fortnight_redesign/design-files/shared.jsx
 * (`richetoAdvice`). Returns up to 4 contextual tips ordered by severity, with
 * `color` tokens chosen from the cozy palette.
 */

import { bucketStats, type BucketWithSpend } from '@/lib/plan'
import { expectedToday } from '@/lib/goals'
import type { Goal } from '@/types'

export type AdviceKind = 'over' | 'goal-behind' | 'goal-ahead' | 'save-low'

export interface AdviceTip {
  kind: AdviceKind
  /** Display title — short, attention-grabbing. */
  title: string
  /** Body copy — actionable suggestion. */
  body: string
  /** CTA button label. */
  action: string
  /** Hex colour for accent stripe + CTA — drawn from the new tokens. */
  color: string
}

const COLOR_CORAL = '#FF5A5F'
const COLOR_MINT = '#2BB673'

/** Returns up to 4 tips ordered by severity. */
export function richetoAdvice(
  buckets: BucketWithSpend[],
  monthlyIncome: number,
  goals: Goal[],
): AdviceTip[] {
  const tips: AdviceTip[] = []

  // 1) Buckets over budget — find the worst item inside each overspent bucket.
  for (const b of buckets) {
    const { diff } = bucketStats(b, monthlyIncome)
    if (diff > 0) {
      const over = Math.round(diff)
      let worst: { name: string; diff: number } | null = null
      for (const it of b.items) {
        const itPlan = (monthlyIncome * it.pct) / 100
        const itDiff = (it.spent ?? 0) - itPlan
        if (worst === null || itDiff > worst.diff) {
          worst = { name: it.name, diff: itDiff }
        }
      }
      tips.push({
        kind: 'over',
        title: `Te pasaste $${over.toLocaleString()} en ${b.name}`,
        body:
          worst && worst.diff > 0
            ? `Lo más gordo: ${worst.name}. Probemos bajar 20% la próxima quincena.`
            : 'Revisa qué categoría te está sacando. Yo te aviso si sigues así.',
        action: 'Ver detalle',
        color: COLOR_CORAL,
      })
    }
  }

  // 2) Savings goals off-track (only non-debt goals get plan-vs-real coaching).
  for (const g of goals.filter((x) => !x.is_debt)) {
    const expected = expectedToday(g)
    const gap = expected - g.saved
    if (gap > 500) {
      tips.push({
        kind: 'goal-behind',
        title: `${g.name}: vas $${Math.round(gap).toLocaleString()} atrás`,
        body: `Aporta $${Math.round(gap / 2).toLocaleString()} extra este mes para volver al plan.`,
        action: 'Aportar',
        color: g.color ?? COLOR_CORAL,
      })
    } else if (g.saved - expected > 500) {
      tips.push({
        kind: 'goal-ahead',
        title: `¡Vas adelantado en ${g.name}!`,
        body: `Llevas $${Math.round(g.saved - expected).toLocaleString()} arriba del plan. Sigue así.`,
        action: 'Ver meta',
        color: COLOR_MINT,
      })
    }
  }

  // 3) Savings bucket under-funded (less than 60% of plan).
  const saveBucket = buckets.find((b) => b.slug === 'save')
  if (saveBucket) {
    const { planAmount, spent } = bucketStats(saveBucket, monthlyIncome)
    if (planAmount > 0 && spent < planAmount * 0.6) {
      tips.push({
        kind: 'save-low',
        title: 'Estás ahorrando menos de lo planeado',
        body: `Pellizca $${Math.round((planAmount - spent) / 2).toLocaleString()} hoy y mueve a ahorro antes de gastarlo.`,
        action: 'Mover ahorro',
        color: COLOR_MINT,
      })
    }
  }

  return tips.slice(0, 4)
}
