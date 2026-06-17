import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  IconArrowDown,
  IconArrowUp,
  IconBolt,
  IconCalendarEvent,
  IconCash,
  IconChevronDown,
  IconChevronRight,
  IconCreditCard,
  IconInfoCircle,
  IconLink,
  IconRocket,
  IconShoppingBag,
  IconTags,
  IconWallet,
} from '@tabler/icons-react'
import type { Account } from '@/types'
import clsx from 'clsx'
import { useBudgetPlan } from '@/hooks/useBudgetPlan'
import { useGoals } from '@/hooks/useGoals'
import { useConfig } from '@/hooks/useConfig'
import { useCategories } from '@/hooks/useCategories'
import { useSubscriptions } from '@/hooks/useSubscriptions'
import { useAccounts } from '@/hooks/useAccounts'
import { useTransactions } from '@/hooks/useTransactions'
import { useInstallments } from '@/hooks/useInstallments'
import { Card } from '@/components/ui/Card'
import { PlanChart } from '@/components/PlanChart'
import { CommitmentsChart } from '@/components/CommitmentsChart'
import { ColchonChart } from '@/components/ColchonChart'
import { Richeto } from '@/components/Richeto'
import { iconFor } from '@/lib/icons'
import { monthsToGoal, projectGoal, expectedToday } from '@/lib/goals'
import { subMonthlyAmount } from '@/lib/projections'
import {
  getMensualidadesComprometidas,
  getColchonReal,
  getRevolvingBalance,
} from '@/lib/debt'

interface PlanContext {
  monthlyIncome: number
}

function shade(hex: string): string {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  const f = (n: number) =>
    Math.max(0, Math.floor(n * 0.7))
      .toString(16)
      .padStart(2, '0')
  return `#${f(r)}${f(g)}${f(b)}`
}

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`
}

export function Proyeccion() {
  const { monthlyIncome } = useOutletContext<PlanContext>()
  const navigate = useNavigate()
  const { data: plan } = useBudgetPlan()
  const { data: goals, loading } = useGoals()
  const { data: config } = useConfig()
  const { data: categories } = useCategories()
  const { data: subs } = useSubscriptions()
  const { data: accounts } = useAccounts()

  const { data: installments, active: activeInstallments } = useInstallments()
  const [debtMode, setDebtMode] = useState<'all' | 'con_costo'>('all')

  const subsMonthly = useMemo(
    () => subs.filter((s) => s.active).reduce((sum, s) => sum + subMonthlyAmount(s.amount, s.frequency), 0),
    [subs],
  )

  const installmentsMonthly = useMemo(
    () => activeInstallments.reduce((sum, i) => sum + Number(i.monthly_amount), 0),
    [activeInstallments],
  )

  // Plan-derived fixed/variable/disposable. Source of truth = the live budget
  // plan (needs/wants/save buckets) — NOT the static user_config estimates,
  // which only get set during onboarding and don't reflect user customisations.
  const subsCategoryId = useMemo(
    () => categories.find((c) => c.name.toLowerCase() === 'suscripciones')?.id ?? null,
    [categories],
  )
  const { fixedFromPlan, variableFromPlan, disposable } = useMemo(() => {
    if (!plan || monthlyIncome <= 0) {
      const fallbackFixed = config?.fixed_monthly ?? 0
      const fallbackVariable = config?.variable_monthly ?? 0
      return {
        fixedFromPlan: fallbackFixed,
        variableFromPlan: fallbackVariable,
        disposable: monthlyIncome - fallbackFixed - fallbackVariable - subsMonthly - installmentsMonthly,
      }
    }
    const needs = plan.buckets.find((b) => b.slug === 'needs')
    const wants = plan.buckets.find((b) => b.slug === 'wants')
    const subsItem = wants?.items.find(
      (it) => subsCategoryId !== null && it.category_id === subsCategoryId,
    )
    const subsItemPlanned = ((subsItem?.pct ?? 0) * monthlyIncome) / 100
    const fixed = ((needs?.pct ?? 0) * monthlyIncome) / 100
    const variable = Math.max(((wants?.pct ?? 0) * monthlyIncome) / 100 - subsItemPlanned, 0)
    return {
      fixedFromPlan: fixed,
      variableFromPlan: variable,
      disposable: monthlyIncome - fixed - variable - subsMonthly - installmentsMonthly,
    }
  }, [plan, monthlyIncome, config, subsMonthly, installmentsMonthly, subsCategoryId])

  const fixedMonthly = fixedFromPlan
  const variableMonthly = variableFromPlan

  const [primaryId, setPrimaryId] = useState<string | null>(null)

  // Auto-select goal on first load. Priority:
  //   1. The user's principal goal (is_primary)
  //   2. Debt goal when net balance is negative
  //   3. First non-debt goal otherwise, falling back to any debt goal
  useEffect(() => {
    if (accounts.length === 0 && goals.length === 0) return
    setPrimaryId((cur) => {
      if (cur !== null) return cur
      const pinned = goals.find((g) => g.is_primary)
      if (pinned) return pinned.id
      const totalAssets = accounts
        .filter((a) => a.type === 'debit')
        .reduce((s, a) => s + Number(a.balance), 0)
      const totalDebt = accounts
        .filter((a) => a.type === 'credit')
        .reduce((s, a) => s + Number(a.balance), 0)
      const netNegative = totalDebt > totalAssets
      if (netNegative) {
        return goals.find((g) => g.is_debt)?.id ?? goals[0]?.id ?? null
      }
      return goals.find((g) => !g.is_debt)?.id ?? goals.find((g) => g.is_debt)?.id ?? null
    })
  }, [goals, accounts])

  const primary = goals.find((g) => g.id === primaryId) ?? null

  // For unlinked debt goals: patch both `saved` (use real credit total) and
  // `monthly` (use actual disposable income so the projection is actionable).
  const conCostoRevolving = useMemo(
    () =>
      accounts
        .filter((a) => a.type === 'credit' && a.cost_type === 'con_costo')
        .reduce((s, a) => s + getRevolvingBalance(a, installments), 0),
    [accounts, installments],
  )

  const patchedPrimary = useMemo(() => {
    if (!primary) return null
    if (primary.is_debt && primary.linked_account_ids.length === 0) {
      const totalCreditDebt = accounts
        .filter((a) => a.type === 'credit')
        .reduce((s, a) => s + Number(a.balance), 0)
      const targetDebt = debtMode === 'con_costo' ? conCostoRevolving : totalCreditDebt
      const derivedSaved = Math.max(0, primary.target - targetDebt)
      const derivedMonthly = disposable > 0 ? disposable : primary.monthly
      return { ...primary, saved: derivedSaved, monthly: derivedMonthly }
    }
    return primary
  }, [primary, accounts, disposable, debtMode, conCostoRevolving])

  const committedData = useMemo(
    () => getMensualidadesComprometidas(installments, accounts),
    [installments, accounts],
  )
  const colchonData = useMemo(
    () => getColchonReal(disposable + installmentsMonthly, committedData),
    [disposable, installmentsMonthly, committedData],
  )

  // Monthly shown in hero — patched value when auto-derived.
  const displayMonthly = (patchedPrimary ?? primary)?.monthly ?? 0
  const monthlyIsDerived =
    primary?.is_debt &&
    primary.linked_account_ids.length === 0 &&
    disposable > 0 &&
    disposable !== primary.monthly

  // For the "ahead of plan" chip — look at debt-payoff transactions this month.
  const now = new Date()
  const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const { data: monthTxs } = useTransactions({ dateFrom })

  const paidThisMonth = useMemo(() => {
    if (!primary) return 0
    if (primary.linked_account_ids.length === 0) return 0
    if (primary.is_debt) {
      const accountIds = new Set(primary.linked_account_ids)
      return monthTxs
        .filter((t) => accountIds.has(t.account_id) && t.amount < 0 && t.type === 'transaction')
        .reduce((s, t) => s + -t.amount, 0)
    }
    return 0
  }, [primary, monthTxs])

  const series = useMemo(() => (patchedPrimary ? projectGoal(patchedPrimary) : []), [patchedPrimary])

  if (loading) {
    return (
      <div className="px-4 pt-2 animate-[fade-in_300ms_ease-out]">
        <div className="h-40 rounded-xl shimmer" />
      </div>
    )
  }

  if (!primary) {
    return (
      <div className="px-4 pt-2 animate-[fade-in_240ms_ease-out]">
        <Card>
          <p className="text-sm text-text-secondary">
            Crea una meta o registra deuda para ver tu proyección.
          </p>
        </Card>
      </div>
    )
  }

  const isDebt = primary.is_debt
  const finishIdx = isDebt
    ? series.findIndex((p) => p.value === 0)
    : series.findIndex((p) => p.value >= (patchedPrimary?.target ?? primary.target))
  const monthsLeft = patchedPrimary ? monthsToGoal(patchedPrimary) : Infinity
  const color = primary.color ?? '#2A4BFF'
  const finishYear = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() + (finishIdx >= 0 ? finishIdx : monthsLeft))
    return d.getFullYear()
  })()

  const linkedAccounts = accounts.filter((a) => primary.linked_account_ids.includes(a.id))
  const linkedBalance = linkedAccounts.reduce((s, a) => s + Number(a.balance), 0)

  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const expectedSoFar = primary.monthly * (dayOfMonth / daysInMonth)
  const ahead = isDebt && paidThisMonth > 0 ? paidThisMonth - expectedSoFar : null

  const expectedNow = expectedToday(primary)
  const savingsAhead = !isDebt ? primary.saved - expectedNow : null

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-2 animate-[fade-in_240ms_ease-out]">
      {/* Goal picker chips */}
      <div className="mb-1 flex gap-1.5 overflow-x-auto pb-1">
        {goals.map((g) => {
          const Icon = iconFor(g.icon)
          const sel = primaryId === g.id
          const c = g.color ?? '#2A4BFF'
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setPrimaryId(g.id)}
              className={clsx(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-bold transition-all',
                sel ? 'text-white' : 'text-text shadow-card',
              )}
              style={
                sel
                  ? { background: c, boxShadow: `0 2px 6px ${c}33` }
                  : { background: 'var(--color-bg-elevated)' }
              }
            >
              <Icon size={14} stroke={2} color={sel ? '#fff' : c} />
              {g.name}
            </button>
          )
        })}
      </div>

      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-xl p-5 text-white shadow-card"
        style={{
          background: isDebt
            ? 'linear-gradient(135deg, #2BB673 0%, #1F8F58 100%)'
            : `linear-gradient(135deg, ${color} 0%, ${shade(color)} 100%)`,
        }}
      >
        <div className="absolute -right-7 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="relative mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 opacity-85">
            <IconRocket size={14} stroke={2} color="#fff" />
            <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em]">
              {isDebt ? 'Mes libre de deuda' : 'Llegas a la meta'}
            </span>
          </div>
          {ahead != null && Math.abs(ahead) >= 100 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-extrabold backdrop-blur-sm">
              {ahead > 0 ? <IconArrowUp size={10} stroke={3} /> : <IconArrowDown size={10} stroke={3} />}
              {ahead > 0 ? 'Adelantado' : 'Atrasado'} {fmtMoney(Math.abs(ahead))}
            </span>
          )}
          {savingsAhead != null && Math.abs(savingsAhead) >= 100 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-extrabold backdrop-blur-sm">
              {savingsAhead > 0 ? <IconArrowUp size={10} stroke={3} /> : <IconArrowDown size={10} stroke={3} />}
              {savingsAhead > 0 ? 'Adelantado' : 'Atrasado'} {fmtMoney(Math.abs(savingsAhead))}
            </span>
          )}
        </div>
        <p className="relative font-display text-[32px] font-extrabold leading-none">
          {finishIdx >= 0 ? series[finishIdx].month : '—'}{' '}
          {finishYear}
        </p>
        <div className="relative mt-1.5 flex items-baseline gap-2">
          <p className="text-[12.5px] font-medium opacity-85">
            Aportando{' '}
            <b className="font-mono">{fmtMoney(displayMonthly)}/mes</b>
          </p>
          {monthlyIsDerived && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9.5px] font-extrabold tracking-wide opacity-90">
              = tu disponible
            </span>
          )}
        </div>
        {linkedAccounts.length > 0 && (
          <p className="relative mt-1 inline-flex items-center gap-1 text-[11px] font-medium opacity-80">
            <IconLink size={10} />
            {linkedAccounts.length} cuenta{linkedAccounts.length === 1 ? '' : 's'} · {fmtMoney(linkedBalance)}
          </p>
        )}
      </div>

      {/* Chart */}
      <Card id="tour-plan-chart">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-sm font-extrabold text-text">
            {isDebt ? 'Deuda restante' : 'Ahorro acumulado'}
          </span>
          <span className="text-[11px] font-semibold text-text-tertiary">
            toca o desliza para ver detalle
          </span>
        </div>
        <PlanChart
          series={series}
          color={color}
          isDebt={isDebt}
          target={patchedPrimary?.target ?? primary.target}
        />
      </Card>

      {/* Agresivo toggle — only for unlinked debt goals */}
      {isDebt && primary.linked_account_ids.length === 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDebtMode('all')}
              className={clsx(
                'flex-1 rounded-full py-2 text-[12px] font-extrabold transition-all',
                debtMode === 'all'
                  ? 'bg-primary text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)]'
                  : 'bg-bg-secondary text-text-secondary',
              )}
            >
              Toda la deuda
            </button>
            <button
              type="button"
              onClick={() => setDebtMode('con_costo')}
              className={clsx(
                'flex-1 rounded-full py-2 text-[12px] font-extrabold transition-all',
                debtMode === 'con_costo'
                  ? 'bg-debt text-white shadow-[0_2px_8px_rgba(239,68,68,0.3)]'
                  : 'bg-bg-secondary text-text-secondary',
              )}
            >
              Solo con costo
            </button>
          </div>
          {debtMode === 'con_costo' && (
            <p className="rounded-xl bg-primary/5 px-3 py-2 text-[11px] font-medium text-text-secondary">
              Los MSI 0% siguen su calendario propio. Tu excedente va a ahorro.
            </p>
          )}
        </div>
      )}

      {/* Balance breakdown — collapsible, collapsed by default */}
      <BalanceBreakdownCard accounts={accounts} />

      {/* Disposable breakdown */}
      <Card>
        <p className="mb-2.5 text-[13px] font-extrabold text-text">De dónde sale tu disponible</p>
        <div className="flex flex-col gap-1.5">
          <BreakdownRow
            icon={IconCash}
            color="#2BB673"
            label="Ingreso mensual"
            value={`+${fmtMoney(monthlyIncome)}`}
            valueColor="#1F8F58"
          />
          <BreakdownRow
            icon={IconBolt}
            color="#2A4BFF"
            label="Fijos"
            sub="del presupuesto de necesidades"
            value={`−${fmtMoney(fixedMonthly)}`}
            onClick={() => navigate('/plan/presupuesto')}
          />
          <BreakdownRow
            icon={IconTags}
            color="#9B7BFF"
            label="Suscripciones"
            value={`−${fmtMoney(subsMonthly)}`}
            sub={`${subs.filter((s) => s.active).length} activa${subs.filter((s) => s.active).length === 1 ? '' : 's'} · ya excluidas de variables`}
            onClick={() => navigate('/cuentas/suscripciones')}
          />
          {installmentsMonthly > 0 && (
            <BreakdownRow
              icon={IconCalendarEvent}
              color="#6366F1"
              label="Meses sin intereses"
              value={`−${fmtMoney(installmentsMonthly)}`}
              sub={`${activeInstallments.length} activo${activeInstallments.length === 1 ? '' : 's'}`}
            />
          )}
          <BreakdownRow
            icon={IconShoppingBag}
            color="#FF8A65"
            label="Variables (plan)"
            value={`−${fmtMoney(variableMonthly)}`}
          />
          <div className="my-1 h-px bg-border" />
          <BreakdownRow
            icon={IconRocket}
            color={disposable >= 0 ? '#2BB673' : '#FF5A5F'}
            label="Disponible"
            value={fmtMoney(disposable)}
            valueColor={disposable >= 0 ? '#1F8F58' : '#FF5A5F'}
            bold
          />
        </div>

        {/* ¿Cómo se calcula? collapsed section */}
        <HowCalcSection />
      </Card>

      {/* Compromisos y colchón */}
      {committedData.some((d) => d.total > 0) && (
        <Card id="tour-plan-colchon">
          <p className="mb-1 text-[13px] font-extrabold text-text">Compromisos mes a mes</p>
          <p className="mb-3 text-[11px] font-medium text-text-tertiary">
            Azul: cuotas MSI del mes · Rojo: pago mín. saldo libre (~1.5%) — ambos suman tu "Deuda a la vista"
          </p>
          <CommitmentsChart data={committedData} />
          <div className="mt-5">
            <p className="mb-1 text-[12.5px] font-extrabold text-text">Colchón real disponible</p>
            <p className="mb-3 text-[11px] font-medium text-text-tertiary">
              Lo que sobra de tu disponible tras cubrir todos los compromisos
            </p>
            <ColchonChart data={colchonData} />
          </div>
        </Card>
      )}

      {/* Si aportas más */}
      <Card>
        <p className="mb-2.5 text-[13px] font-extrabold text-text">Si aportas más</p>
        <div className="flex flex-col gap-2">
          {[{ pct: 10 }, { pct: 25 }, { pct: 50 }].map(({ pct }) => {
            const effective = patchedPrimary ?? primary
            const next = effective.monthly * (1 + pct / 100)
            const remaining = Math.max(effective.target - effective.saved, 0)
            const months = next > 0 ? Math.ceil(remaining / next) : '∞'
            return (
              <div key={pct} className="flex items-center gap-2.5">
                <span className="inline-flex min-w-[50px] justify-center rounded-full bg-asset-soft px-2.5 py-1 font-mono text-[11px] font-extrabold text-asset-deep">
                  +{pct}%
                </span>
                <span className="flex-1 text-[12.5px] font-semibold text-text-secondary">
                  Logras en <b className="text-text">{months} meses</b>
                </span>
                <span className="font-mono text-[11.5px] text-text-tertiary">
                  {fmtMoney(next)}/mes
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Richeto predice */}
      <div
        className="flex items-start gap-3 rounded-xl p-3.5 shadow-card"
        style={{
          background:
            'linear-gradient(135deg, var(--color-asset-soft) 0%, var(--color-bg-elevated) 100%)',
        }}
      >
        <Richeto size={56} shadowColor="rgba(43,182,115,0.3)" />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="mb-1 text-[12.5px] font-extrabold text-asset-deep">Richeto predice</p>
          <p className="text-[12px] font-medium leading-snug text-text-secondary">
            Con tu plan <b className="text-text">{plan?.plan.preset ?? '50-30-20'}</b> y{' '}
            <b className="text-text">{fmtMoney(disposable)}/mes</b> disponibles, tu meta{' '}
            <b className="text-text">{primary.name}</b> llega en{' '}
            <b className="text-text">
              {Number.isFinite(monthsLeft) ? monthsLeft : '?'} meses
            </b>
            .{' '}
            {linkedAccounts.length === 0 && (
              <span className="text-text">
                Enlaza una cuenta a esta meta para que el progreso se actualice solo.
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* BalanceBreakdownCard — collapsed by default                         */
/* ------------------------------------------------------------------ */

function BalanceBreakdownCard({ accounts }: { accounts: Account[] }) {
  const [expanded, setExpanded] = useState(false)

  const debit = accounts.filter((a) => a.type === 'debit')
  const credit = accounts.filter((a) => a.type === 'credit')
  if (debit.length === 0 && credit.length === 0) return null

  const totalAssets = debit.reduce((s, a) => s + Number(a.balance), 0)
  const totalDebt = credit.reduce((s, a) => s + Number(a.balance), 0)
  const net = totalAssets - totalDebt
  const netPositive = net >= 0

  return (
    <Card className="overflow-hidden p-0">
      {/* Summary row — always visible, tap to expand */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3.5 transition-colors hover:bg-bg-secondary"
      >
        <p className="flex-1 text-left text-[13px] font-extrabold text-text">Saldo actual</p>
        <div className="flex items-center gap-2">
          {/* Debit / credit summary counts */}
          {debit.length > 0 && (
            <span className="rounded-full bg-asset-soft px-2 py-0.5 text-[10px] font-bold text-asset-deep">
              {debit.length} activo{debit.length !== 1 ? 's' : ''}
            </span>
          )}
          {credit.length > 0 && (
            <span className="rounded-full bg-debt-soft px-2 py-0.5 text-[10px] font-bold text-debt-deep">
              {credit.length} tarjeta{credit.length !== 1 ? 's' : ''}
            </span>
          )}
          <span
            className={clsx(
              'font-mono text-[12px] font-extrabold',
              netPositive ? 'text-asset-deep' : 'text-debt-deep',
            )}
          >
            {netPositive ? '+' : '−'}{fmtMoney(Math.abs(net))}
          </span>
          <IconChevronDown
            size={15}
            className={clsx(
              'shrink-0 text-text-tertiary transition-transform duration-200',
              expanded && 'rotate-180',
            )}
          />
        </div>
      </button>

      {/* Detail — only when expanded */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {debit.length > 0 && (
            <div className="mb-2.5 overflow-hidden rounded-xl" style={{ background: 'var(--color-asset-soft)' }}>
              <div className="flex items-center gap-1.5 px-3 py-1.5">
                <IconWallet size={11} className="text-asset-deep" />
                <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-asset-deep">
                  Activos
                </span>
              </div>
              {debit.map((a, i) => (
                <div
                  key={a.id}
                  className={clsx(
                    'flex items-center justify-between px-3 py-2',
                    i < debit.length - 1 && 'border-b border-white/30',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ background: a.color ?? '#10B981' }} />
                    <span className="text-[12.5px] font-semibold text-text">{a.name}</span>
                  </div>
                  <span className="font-mono text-[12.5px] font-bold text-asset-deep">
                    +{fmtMoney(Number(a.balance))}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-white/40 px-3 py-2">
                <span className="text-[11.5px] font-extrabold text-asset-deep">Total activos</span>
                <span className="font-mono text-[12.5px] font-extrabold text-asset-deep">
                  {fmtMoney(totalAssets)}
                </span>
              </div>
            </div>
          )}

          {credit.length > 0 && (
            <div className="overflow-hidden rounded-xl" style={{ background: 'var(--color-debt-soft)' }}>
              <div className="flex items-center gap-1.5 px-3 py-1.5">
                <IconCreditCard size={11} className="text-debt-deep" />
                <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-debt-deep">
                  Deuda
                </span>
              </div>
              {credit.map((a, i) => (
                <div
                  key={a.id}
                  className={clsx(
                    'flex items-center justify-between px-3 py-2',
                    i < credit.length - 1 && 'border-b border-white/30',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ background: a.color ?? '#EF4444' }} />
                    <span className="text-[12.5px] font-semibold text-text">{a.name}</span>
                  </div>
                  <span className="font-mono text-[12.5px] font-bold text-debt-deep">
                    −{fmtMoney(Number(a.balance))}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-white/40 px-3 py-2">
                <span className="text-[11.5px] font-extrabold text-debt-deep">Total deuda</span>
                <span className="font-mono text-[12.5px] font-extrabold text-debt-deep">
                  {fmtMoney(totalDebt)}
                </span>
              </div>
            </div>
          )}

          {/* Net line */}
          <div className="mt-2.5 flex items-center justify-between rounded-xl bg-bg-secondary px-3 py-2.5">
            <span className="text-[12px] font-extrabold text-text">Saldo neto</span>
            <span
              className={clsx(
                'font-mono text-[13px] font-extrabold',
                netPositive ? 'text-asset-deep' : 'text-debt-deep',
              )}
            >
              {netPositive ? '+' : '−'}{fmtMoney(Math.abs(net))}
            </span>
          </div>
        </div>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* HowCalcSection — collapsed explanation for the disposable formula   */
/* ------------------------------------------------------------------ */

function HowCalcSection() {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2 border-t border-border pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 py-1 text-left"
      >
        <IconInfoCircle size={13} className="shrink-0 text-text-tertiary" />
        <span className="flex-1 text-[11.5px] font-semibold text-text-tertiary">
          ¿Cómo se calcula?
        </span>
        <IconChevronDown
          size={13}
          className={clsx(
            'shrink-0 text-text-tertiary transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="mt-1.5 rounded-xl bg-bg-secondary px-3 py-2.5 text-[11.5px] leading-relaxed text-text-secondary">
          <p>
            <b className="text-text">Fijos</b> = % necesidades × ingreso.
          </p>
          <p className="mt-1">
            <b className="text-text">Variables (plan)</b> = % deseos × ingreso − suscripciones planeadas.
          </p>
          <p className="mt-1">
            Las <b className="text-text">suscripciones</b> se listan por separado para no contarse dos veces con las variables.
          </p>
          <p className="mt-1">
            Los <b className="text-text">meses sin intereses</b> se restan del disponible porque son compromisos fijos mensuales.
          </p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* BreakdownRow                                                         */
/* ------------------------------------------------------------------ */

interface BreakdownRowProps {
  icon: typeof IconCash
  color: string
  label: string
  value: string
  sub?: string
  valueColor?: string
  bold?: boolean
  onClick?: () => void
}

function BreakdownRow({ icon: Icon, color, label, value, sub, valueColor, bold, onClick }: BreakdownRowProps) {
  const inner = (
    <div className="flex items-center gap-2.5 rounded-lg px-1 py-1">
      <div
        className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-md"
        style={{ background: color + '20' }}
      >
        <Icon size={14} stroke={2.2} color={color} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={clsx('text-[12.5px] text-text', bold ? 'font-extrabold' : 'font-bold')}>{label}</p>
        {sub && <p className="text-[10.5px] font-medium text-text-tertiary">{sub}</p>}
      </div>
      <span
        className={clsx('font-mono tabular-nums', bold ? 'text-[15px] font-extrabold' : 'text-[12.5px] font-bold')}
        style={{ color: valueColor ?? 'var(--color-text)' }}
      >
        {value}
      </span>
      {onClick && <IconChevronRight size={14} className="text-text-tertiary" />}
    </div>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="rounded-lg text-left transition-colors hover:bg-bg-secondary">
        {inner}
      </button>
    )
  }
  return inner
}
