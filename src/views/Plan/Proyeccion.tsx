import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { IconRocket } from '@tabler/icons-react'
import clsx from 'clsx'
import { useBudgetPlan } from '@/hooks/useBudgetPlan'
import { useGoals } from '@/hooks/useGoals'
import { useConfig } from '@/hooks/useConfig'
import { useSubscriptions } from '@/hooks/useSubscriptions'
import { Card } from '@/components/ui/Card'
import { PlanChart } from '@/components/PlanChart'
import { Richeto } from '@/components/Richeto'
import { iconFor } from '@/lib/icons'
import { monthsToGoal, projectGoal } from '@/lib/goals'
import { calcMonthlyDisposable } from '@/lib/projections'

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

export function Proyeccion() {
  useOutletContext<PlanContext>() // contract: present even if unused now
  const { data: plan } = useBudgetPlan()
  const { data: goals, loading } = useGoals()
  const { data: config } = useConfig()
  const { data: subs } = useSubscriptions()

  const disposable = config ? calcMonthlyDisposable(config, subs) : 0

  const [primaryId, setPrimaryId] = useState<string | null>(null)

  // Auto-select the first goal once goals load. Uses the updater form so a
  // manual chip selection (cur !== null) is never overwritten by a refetch.
  useEffect(() => {
    setPrimaryId((cur) => {
      if (cur !== null) return cur
      return goals.find((g) => !g.is_debt)?.id ?? goals.find((g) => g.is_debt)?.id ?? null
    })
  }, [goals])

  const primary = goals.find((g) => g.id === primaryId) ?? null

  const series = useMemo(() => (primary ? projectGoal(primary) : []), [primary])

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
    : series.findIndex((p) => p.value >= primary.target)
  const monthsLeft = monthsToGoal(primary)
  const color = primary.color ?? '#2A4BFF'
  const finishYear = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() + (finishIdx >= 0 ? finishIdx : monthsLeft))
    return d.getFullYear()
  })()

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-2 animate-[fade-in_240ms_ease-out]">
      {/* Goal picker chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
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
                  ? { background: c, boxShadow: `0 6px 14px ${c}55` }
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
        <div className="relative mb-1.5 flex items-center gap-1.5 opacity-85">
          <IconRocket size={14} stroke={2} color="#fff" />
          <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em]">
            {isDebt ? 'Mes libre de deuda' : 'Llegas a la meta'}
          </span>
        </div>
        <p className="relative font-display text-[32px] font-extrabold leading-none">
          {finishIdx >= 0 ? series[finishIdx].month : '—'}{' '}
          {finishYear}
        </p>
        <p className="relative mt-1.5 text-[12.5px] font-medium opacity-85">
          Aportando{' '}
          <b className="font-mono">${Math.round(primary.monthly).toLocaleString()}/mes</b>
        </p>
      </div>

      {/* Chart */}
      <Card>
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-sm font-extrabold text-text">
            {isDebt ? 'Deuda restante' : 'Ahorro acumulado'}
          </span>
          <span className="text-[11px] font-semibold text-text-tertiary">
            {series.length} meses
          </span>
        </div>
        <PlanChart series={series} color={color} isDebt={isDebt} target={primary.target} />
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
            const next = primary.monthly * (1 + pct / 100)
            const remaining = Math.max(primary.target - primary.saved, 0)
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
                  ${Math.round(next).toLocaleString()}/mes
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
            <b className="text-text">${Math.round(disposable).toLocaleString()}/mes</b> disponibles,
            tu meta <b className="text-text">{primary.name}</b> llega en{' '}
            <b className="text-text">
              {Number.isFinite(monthsLeft) ? monthsLeft : '?'} meses
            </b>
            .{subs.filter((s) => s.active).length > 0 && ` Suscripciones: $${Math.round(subs.filter(s=>s.active).reduce((a,s2)=>a+(s2.frequency==='anual'?s2.amount/12:s2.frequency==='trimestral'?s2.amount/3:s2.amount),0)).toLocaleString()}/mes.`}
          </p>
        </div>
      </div>
    </div>
  )
}
