import { useMemo } from 'react'
import { useBudgetPlan } from '@/hooks/useBudgetPlan'
import { useCategories } from '@/hooks/useCategories'
import { useConfig } from '@/hooks/useConfig'
import { useInstallments } from '@/hooks/useInstallments'
import { useSubscriptions } from '@/hooks/useSubscriptions'
import { subMonthlyAmount } from '@/lib/projections'
import { PAY_FREQS, type PayFreq } from '@/lib/paydays'

export interface MonthlyDisposable {
  monthlyIncome: number
  fixedMonthly: number
  variableMonthly: number
  subsMonthly: number
  installmentsMonthly: number
  /** Income minus everything already committed. Can be negative. */
  disposable: number
  /** False when we fell back to the onboarding estimates in `user_config`. */
  fromPlan: boolean
}

/**
 * What's left over each month once the budget plan and the fixed commitments
 * are accounted for.
 *
 * This used to live inside the Proyección view, which meant Home had no way to
 * reach it and projected the raw stored goal instead — the two screens then
 * disagreed about the debt-free month. Both read it from here now.
 */
export function useMonthlyDisposable(): MonthlyDisposable {
  const { data: plan } = useBudgetPlan()
  const { data: config } = useConfig()
  const { data: categories } = useCategories()
  const { data: subs } = useSubscriptions()
  const { active: activeInstallments } = useInstallments()

  const monthlyIncome = useMemo(() => {
    const freq: PayFreq = (config?.pay_freq ?? 'catorcenal') as PayFreq
    return Math.round((config?.pay_amount ?? 0) * PAY_FREQS[freq].cyclesPerMonth)
  }, [config])

  const subsMonthly = useMemo(
    () => subs.filter((s) => s.active).reduce((sum, s) => sum + subMonthlyAmount(s.amount, s.frequency), 0),
    [subs],
  )

  const installmentsMonthly = useMemo(
    () => activeInstallments.reduce((sum, i) => sum + Number(i.monthly_amount), 0),
    [activeInstallments],
  )

  const subsCategoryId = useMemo(
    () => categories.find((c) => c.name.toLowerCase() === 'suscripciones')?.id ?? null,
    [categories],
  )

  return useMemo(() => {
    // Source of truth = the live budget plan (needs/wants/save buckets), NOT
    // the static user_config estimates, which only get set during onboarding
    // and don't reflect later customisations.
    if (!plan || monthlyIncome <= 0) {
      const fixed = config?.fixed_monthly ?? 0
      const variable = config?.variable_monthly ?? 0
      return {
        monthlyIncome,
        fixedMonthly: fixed,
        variableMonthly: variable,
        subsMonthly,
        installmentsMonthly,
        disposable: monthlyIncome - fixed - variable - subsMonthly - installmentsMonthly,
        fromPlan: false,
      }
    }
    const needs = plan.buckets.find((b) => b.slug === 'needs')
    const wants = plan.buckets.find((b) => b.slug === 'wants')
    const subsItem = wants?.items.find(
      (it) => subsCategoryId !== null && it.category_id === subsCategoryId,
    )
    // Subscriptions budgeted inside "wants" are already counted as subsMonthly;
    // subtracting them here keeps them from being charged twice.
    const subsItemPlanned = ((subsItem?.pct ?? 0) * monthlyIncome) / 100
    const fixed = ((needs?.pct ?? 0) * monthlyIncome) / 100
    const variable = Math.max(((wants?.pct ?? 0) * monthlyIncome) / 100 - subsItemPlanned, 0)
    return {
      monthlyIncome,
      fixedMonthly: fixed,
      variableMonthly: variable,
      subsMonthly,
      installmentsMonthly,
      disposable: monthlyIncome - fixed - variable - subsMonthly - installmentsMonthly,
      fromPlan: true,
    }
  }, [plan, monthlyIncome, config, subsMonthly, installmentsMonthly, subsCategoryId])
}
