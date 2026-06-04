import {
  IconAdjustments,
  IconBuildingBank,
  IconCalendarCheck,
  IconFlame,
  IconRocket,
  IconStar,
  IconTag,
  IconTarget,
  IconWriting,
  type Icon,
} from '@tabler/icons-react'

/** Inputs that drive mission-progress calculation each render. */
export interface MissionContext {
  weekTxCount: number
  score: number
  weekDebtPayments: number
  weekAdjustmentCount: number
  hasActiveLoan: boolean
  hasActiveSubscription: boolean
  loanPaidThisWeek: boolean
  weekCategorizedTxCount: number
}

export interface MissionDef {
  id: string
  title: string
  reward: number
  icon: Icon
  color: string
  /** Computes current/total from live signals. */
  progress: (ctx: MissionContext) => { current: number; total: number }
}

/**
 * Canonical weekly missions. Order = render order. IDs are stable — they're
 * persisted in `mission_completions.mission_id`, so renaming an existing one
 * would lose claim history.
 */
export const MISSION_CATALOG: MissionDef[] = [
  {
    id: 'log-3',
    title: 'Registra 3 gastos esta semana',
    reward: 20,
    icon: IconFlame,
    color: '#FF5A5F',
    progress: ({ weekTxCount }) => ({
      current: Math.min(weekTxCount, 3),
      total: 3,
    }),
  },
  {
    id: 'log-5',
    title: 'Registra 5 gastos esta semana',
    reward: 35,
    icon: IconWriting,
    color: '#FF8A65',
    progress: ({ weekTxCount }) => ({
      current: Math.min(weekTxCount, 5),
      total: 5,
    }),
  },
  {
    id: 'log-10',
    title: 'Registra 10 gastos esta semana',
    reward: 60,
    icon: IconFlame,
    color: '#F59E0B',
    progress: ({ weekTxCount }) => ({
      current: Math.min(weekTxCount, 10),
      total: 10,
    }),
  },
  {
    id: 'score-up',
    title: 'Mantén tu score en 5+',
    reward: 50,
    icon: IconTarget,
    color: '#2A4BFF',
    progress: ({ score }) => ({
      current: score >= 5 ? 1 : 0,
      total: 1,
    }),
  },
  {
    id: 'score-7',
    title: 'Mantén tu score financiero en 7+',
    reward: 75,
    icon: IconStar,
    color: '#9B7BFF',
    progress: ({ score }) => ({
      current: score >= 7 ? 1 : 0,
      total: 1,
    }),
  },
  {
    id: 'pay-debt',
    title: 'Aporta a tu deuda esta semana',
    reward: 100,
    icon: IconRocket,
    color: '#9B7BFF',
    progress: ({ weekDebtPayments }) => ({
      current: weekDebtPayments > 0 ? 1 : 0,
      total: 1,
    }),
  },
  {
    id: 'adjust-balance',
    title: 'Ajusta el saldo de una cuenta',
    reward: 10,
    icon: IconAdjustments,
    color: '#10B981',
    progress: ({ weekAdjustmentCount }) => ({
      current: Math.min(weekAdjustmentCount, 1),
      total: 1,
    }),
  },
  {
    id: 'add-loan',
    title: 'Registra un préstamo',
    reward: 15,
    icon: IconBuildingBank,
    color: '#2A4BFF',
    progress: ({ hasActiveLoan }) => ({
      current: hasActiveLoan ? 1 : 0,
      total: 1,
    }),
  },
  {
    id: 'pay-loan',
    title: 'Marca un préstamo como pagado',
    reward: 40,
    icon: IconCalendarCheck,
    color: '#10B981',
    progress: ({ loanPaidThisWeek }) => ({
      current: loanPaidThisWeek ? 1 : 0,
      total: 1,
    }),
  },
  {
    id: 'add-sub',
    title: 'Agrega una suscripción activa',
    reward: 20,
    icon: IconTag,
    color: '#6366F1',
    progress: ({ hasActiveSubscription }) => ({
      current: hasActiveSubscription ? 1 : 0,
      total: 1,
    }),
  },
  {
    id: 'categorize-3',
    title: 'Categoriza 3 movimientos esta semana',
    reward: 25,
    icon: IconTag,
    color: '#F59E0B',
    progress: ({ weekCategorizedTxCount }) => ({
      current: Math.min(weekCategorizedTxCount, 3),
      total: 3,
    }),
  },
]

/**
 * ISO-week label like '2026-W22'. Monday-based, matching Postgres
 * `extract(week from ...)`. Same week → same label across timezones because
 * we always use the local day.
 */
export function isoWeek(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  // Thursday of current week determines the ISO year.
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
