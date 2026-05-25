import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  IconArrowDown,
  IconArrowUp,
  IconBolt,
  IconCash,
  IconChevronRight,
  IconCreditCard,
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
import { useSubscriptions } from '@/hooks/useSubscriptions'
import { useAccounts } from '@/hooks/useAccounts'
import { useTransactions } from '@/hooks/useTransactions'
import { Card } from '@/components/ui/Card'
import { PlanChart } from '@/components/PlanChart'
import { Richeto } from '@/components/Richeto'
import { iconFor } from '@/lib/icons'
import { monthsToGoal, projectGoal, expectedToday } from '@/lib/goals'
import { calcMonthlyDisposable, subMonthlyAmount } from '@/lib/projections'

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
  const { data: subs } = useSubscriptions()
  const { data: accounts } = useAccounts()

  const subsMonthly = useMemo(
    () => subs.filter((s) => s.active).reduce((sum, s) => sum + subMonthlyAmount(s.amount, s.frequency), 0),
    [subs],
  )
  const disposable = config ? calcMonthlyDisposable(config, subs) : 0
  const fixedMonthly = config?.fixed_monthly ?? 0
  const variableMonthly = config?.variable_monthly ?? 0

  const [primaryId, setPrimaryId] = useState<string | null>(null)

  useEffect(() => {
    setPrimaryId((cur) => {
      if (cur !== null) return cur
      return goals.find((g) => !g.is_debt)?.id ?? goals.find((g) => g.is_debt)?.id ?? null
    })
  }, [goals])

  const primary = goals.find((g) => g.id === primaryId) ?? null

  // For debt goals with no linked accounts, use total credit balance as the
  // real starting point so the series reflects the actual debt, not the stale
  // target that was seeded before account-linking existed.
  const patchedPrimary = useMemo(() => {
    if (!primary) return null
    if (primary.is_debt && primary.linked_account_ids.length === 0) {
      const totalCreditDebt = accounts
        .filter((a) => a.type === 'credit')
        .reduce((s, a) => s + Number(a.balance), 0)
      return { ...primary, saved: Math.max(0, primary.target - totalCreditDebt) }
    }
    return primary
  }, [primary, accounts])

  // For the "ahead of plan" chip — look at debt-payoff transactions this month
  // on any linked credit account (or balance delta vs expectedToday for savings).
  const now = new Date()
  const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const { data: monthTxs } = useTransactions({ dateFrom })

  const paidThisMonth = useMemo(() => {
    if (!primary) return 0
    if (primary.linked_account_ids.length === 0) return 0
    if (primary.is_debt) {
      // Sum of credit-card payments (negative amounts on credit accounts) this month
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

  // Linked accounts (for the "qué cuentas" line in the breakdown)
  const linkedAccounts = accounts.filter((a) => primary.linked_account_ids.includes(a.id))
  const linkedBalance = linkedAccounts.reduce((s, a) => s + Number(a.balance), 0)

  // Ahead-of-plan logic. For debt goals: did we pay more than expected so far?
  // expectedThisMonth ≈ goal.monthly prorated by days elapsed.
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const expectedSoFar = primary.monthly * (dayOfMonth / daysInMonth)
  const ahead = isDebt && paidThisMonth > 0 ? paidThisMonth - expectedSoFar : null

  // Expected vs current (savings only)
  const expectedNow = expectedToday(primary)
  const savingsAhead = !isDebt ? primary.saved - expectedNow : null

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-2 animate-[fade-in_240ms_ease-out]">
      {/* Goal picker chips — softer shadow so it doesn't bleed onto the hero */}
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
          {/* Ahead-of-plan chip */}
          {ahead != null && Math.abs(ahead) >= 100 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-extrabold backdrop-blur-sm"
            >
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
        <p className="relative mt-1.5 text-[12.5px] font-medium opacity-85">
          Aportando{' '}
          <b className="font-mono">{fmtMoney(primary.monthly)}/mes</b>
        </p>
        {linkedAccounts.length > 0 && (
          <p className="relative mt-1 inline-flex items-center gap-1 text-[11px] font-medium opacity-80">
            <IconLink size={10} />
            {linkedAccounts.length} cuenta{linkedAccounts.length === 1 ? '' : 's'} · {fmtMoney(linkedBalance)}
          </p>
        )}
      </div>

      {/* Chart */}
      <Card>
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-sm font-extrabold text-text">
            {isDebt ? 'Deuda restante' : 'Ahorro acumulado'}
          </span>
          <span className="text-[11px] font-semibold text-text-tertiary">
            toca o desliza para ver detalle
          </span>
        </div>
        <PlanChart series={series} color={color} isDebt={isDebt} target={patchedPrimary?.target ?? primary.target} />
      </Card>

      {/* Balance breakdown — where does the current balance come from? */}
      <BalanceBreakdownCard accounts={accounts} />

      {/* Breakdown card — explains the disposable number */}
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
            value={`−${fmtMoney(fixedMonthly)}`}
            onClick={() => navigate('/plan/presupuesto')}
          />
          <BreakdownRow
            icon={IconTags}
            color="#9B7BFF"
            label="Suscripciones"
            value={`−${fmtMoney(subsMonthly)}`}
            sub={`${subs.filter((s) => s.active).length} activa${subs.filter((s) => s.active).length === 1 ? '' : 's'}`}
            onClick={() => navigate('/cuentas/suscripciones')}
          />
          <BreakdownRow
            icon={IconShoppingBag}
            color="#FF8A65"
            label="Variables estimados"
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
      </Card>

      {/* Si aportas más */}
      <Card>
        <p className="mb-2.5 text-[13px] font-extrabold text-text">Si aportas más</p>
        <div className="flex flex-col gap-2">
          {[
            { pct: 10 },
            { pct: 25 },
            { pct: 50 },
          ].map(({ pct }) => {
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
          <p className="mb-1 text-[12.5px] font-extrabold text-asset-deep">
            Richeto predice
          </p>
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

function BalanceBreakdownCard({ accounts }: { accounts: Account[] }) {
  const debit = accounts.filter((a) => a.type === 'debit')
  const credit = accounts.filter((a) => a.type === 'credit')
  if (debit.length === 0 && credit.length === 0) return null

  const totalAssets = debit.reduce((s, a) => s + Number(a.balance), 0)
  const totalDebt = credit.reduce((s, a) => s + Number(a.balance), 0)
  const net = totalAssets - totalDebt
  const netPositive = net >= 0

  return (
    <Card>
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[13px] font-extrabold text-text">Saldo actual</p>
        <span
          className={clsx(
            'rounded-full px-2 py-0.5 font-mono text-[11px] font-extrabold',
            netPositive ? 'bg-asset-soft text-asset-deep' : 'bg-debt-soft text-debt-deep',
          )}
        >
          {netPositive ? '+' : '−'}{fmtMoney(Math.abs(net))}
        </span>
      </div>

      {debit.length > 0 && (
        <div className="mb-2 overflow-hidden rounded-xl" style={{ background: 'var(--color-asset-soft)' }}>
          <div className="flex items-center gap-1.5 px-3 py-1.5">
            <IconWallet size={11} className="text-asset-deep" />
            <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-asset-deep">Activos</span>
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
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ background: a.color ?? '#10B981' }}
                />
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
            <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-debt-deep">Deuda</span>
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
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ background: a.color ?? '#EF4444' }}
                />
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
    </Card>
  )
}

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

function BreakdownRow({
  icon: Icon,
  color,
  label,
  value,
  sub,
  valueColor,
  bold,
  onClick,
}: BreakdownRowProps) {
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
      <button type="button" onClick={onClick} className="text-left transition-colors hover:bg-bg-secondary rounded-lg">
        {inner}
      </button>
    )
  }
  return inner
}
