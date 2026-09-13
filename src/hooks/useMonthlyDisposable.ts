import { useMemo } from 'react'
import { useBudgetPlan } from '@/hooks/useBudgetPlan'
import { useCategories } from '@/hooks/useCategories'
import { useConfig } from '@/hooks/useConfig'
import { useInstallments } from '@/hooks/useInstallments'
import { useSubscriptions } from '@/hooks/useSubscriptions'
import { subMonthlyAmount } from '@/lib/projections'
import { conCategoriaPorDefecto, enlacesPorCategoria, liberadoPorSobre } from '@/lib/recurringLink'
import { PAY_FREQS, payFreqOf } from '@/lib/paydays'

export interface MonthlyDisposable {
  monthlyIncome: number
  fixedMonthly: number
  variableMonthly: number
  /** Suscripciones activas (Netflix, gimnasio…). */
  subsMonthly: number
  /** Gastos fijos con fecha (renta, luz, colegiatura…). */
  fijosMonthly: number
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
    const freq = payFreqOf(config?.pay_freq)
    return Math.round((config?.pay_amount ?? 0) * PAY_FREQS[freq].cyclesPerMonth)
  }, [config])

  // Separados porque el usuario los piensa distinto — la renta no se cancela —
  // aunque por dentro sean la misma fila y se resten igual del disponible.
  const { subsMonthly, fijosMonthly } = useMemo(() => {
    let suscripciones = 0
    let fijos = 0
    for (const s of subs) {
      if (!s.active) continue
      const mensual = subMonthlyAmount(s.amount, s.frequency)
      if (s.kind === 'fijo') fijos += mensual
      else suscripciones += mensual
    }
    return { subsMonthly: suscripciones, fijosMonthly: fijos }
  }, [subs])

  const installmentsMonthly = useMemo(
    () => activeInstallments.reduce((sum, i) => sum + Number(i.monthly_amount), 0),
    [activeInstallments],
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
        fijosMonthly,
        installmentsMonthly,
        disposable: monthlyIncome - fixed - variable - subsMonthly - fijosMonthly - installmentsMonthly,
        fromPlan: false,
      }
    }
    const needs = plan.buckets.find((b) => b.slug === 'needs')
    const wants = plan.buckets.find((b) => b.slug === 'wants')

    /**
     * Lo presupuestado que se libera, sobre por sobre.
     *
     * La regla — una categoría acredita una sola partida — vive en
     * `lib/recurringLink`, compartida con la pantalla de Presupuesto. Tenerla
     * dos veces es lo que hizo divergir Inicio y Proyección hace tres
     * versiones, y no hay motivo para repetir el experimento.
     */
    const enlaces = enlacesPorCategoria(plan.buckets, conCategoriaPorDefecto(subs, categories))
    const liberado = liberadoPorSobre(plan.buckets, enlaces, monthlyIncome)

    const sobre = (b: typeof needs) =>
      Math.max(((b?.pct ?? 0) * monthlyIncome) / 100 - (liberado.get(b?.slug ?? '') ?? 0), 0)

    const fixed = sobre(needs)
    const variable = sobre(wants)
    return {
      monthlyIncome,
      fixedMonthly: fixed,
      variableMonthly: variable,
      subsMonthly,
      fijosMonthly,
      installmentsMonthly,
      disposable: monthlyIncome - fixed - variable - subsMonthly - fijosMonthly - installmentsMonthly,
      fromPlan: true,
    }
  }, [plan, monthlyIncome, config, subs, categories, subsMonthly, fijosMonthly, installmentsMonthly])
}
