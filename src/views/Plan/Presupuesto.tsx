import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { IconCheck, IconSettings } from '@tabler/icons-react'
import clsx from 'clsx'
import { useBudgetPlan } from '@/hooks/useBudgetPlan'
import { BucketCard } from '@/components/BucketCard'
import { Richeto } from '@/components/Richeto'
import { PRESETS, planIntegrityPct, type BucketWithSpend } from '@/lib/plan'
import type { PlanPreset, BucketWithItems } from '@/types'

interface PlanContext {
  monthlyIncome: number
}

/** Map raw buckets onto BucketWithSpend by attaching spent=0 — PR-6 wires real spend. */
function withZeroSpend(buckets: BucketWithItems[]): BucketWithSpend[] {
  return buckets.map((b) => ({
    ...b,
    items: b.items.map((it) => ({ ...it, spent: 0 })),
  }))
}

export function Presupuesto() {
  const { monthlyIncome } = useOutletContext<PlanContext>()
  const { data, loading, updateItemPct, applyPlanPreset } = useBudgetPlan()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  if (loading || !data) {
    return (
      <div className="px-4.5 pt-2 animate-[fade-in_300ms_ease-out]">
        <div className="h-40 rounded-xl shimmer" />
      </div>
    )
  }

  const bucketsWithSpend = withZeroSpend(data.buckets)
  const totalBudget = monthlyIncome
  const totalSpent = bucketsWithSpend.reduce(
    (s, b) => s + b.items.reduce((s2, it) => s2 + (it.spent ?? 0), 0),
    0,
  )
  const remaining = totalBudget - totalSpent
  const totalPct = planIntegrityPct(data.buckets)
  const balanced = totalPct === 100

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-2 animate-[fade-in_240ms_ease-out]">
      {/* Disponible hero with plan integrity ribbon */}
      <div
        className="gradient-hero-ink relative overflow-hidden rounded-xl p-5 text-white shadow-hero"
      >
        <div className="absolute -right-7 -top-10 h-36 w-36 rounded-full" style={{ background: 'rgba(155,123,255,0.18)' }} />
        <div className="relative flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[10.5px] font-extrabold uppercase tracking-[0.13em] text-white/55">
              Disponible este mes
            </p>
            <p className="mt-1 font-display text-[32px] font-extrabold leading-none tracking-tight">
              ${Math.round(remaining).toLocaleString()}
            </p>
            <p className="mt-1.5 font-mono text-[11.5px] text-white/60">
              de ${Math.round(totalBudget).toLocaleString()} · gastaste $
              {Math.round(totalSpent).toLocaleString()}
            </p>
          </div>
          <span
            className={clsx(
              'rounded-full border px-2.5 py-1 font-mono text-[10.5px] font-extrabold',
              balanced
                ? 'border-asset/40 bg-asset/20 text-[#5DD296]'
                : 'border-debt/40 bg-debt/20 text-[#FF8488]',
            )}
          >
            {totalPct}% plan
          </span>
        </div>

        {/* Stacked bar */}
        <div
          className="relative mt-3.5 flex h-2.5 overflow-hidden rounded-full"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          {bucketsWithSpend.map((b) => (
            <div
              key={b.id}
              className="transition-[width] duration-500"
              style={{
                width: `${b.pct}%`,
                background: b.color,
                boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10.5px] font-bold opacity-85">
          {bucketsWithSpend.map((b) => (
            <div key={b.id} className="flex items-center gap-1">
              <span
                className="h-[7px] w-[7px] rounded-full"
                style={{ background: b.color }}
              />
              <span>{b.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Preset selector + edit toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 gap-1">
          {(Object.entries(PRESETS) as [PlanPreset, typeof PRESETS[PlanPreset]][]).map(([k, p]) => {
            const active = data.plan.preset === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => void applyPlanPreset(k)}
                className={clsx(
                  'flex-1 rounded-sm px-1.5 py-2 font-mono text-[11px] font-extrabold transition-all',
                  active
                    ? 'bg-text text-text-inverse shadow-[0_4px_10px_rgba(26,31,54,0.2)]'
                    : 'bg-bg-elevated text-text-secondary shadow-card hover:bg-bg-tinted',
                )}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className={clsx(
            'inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-[11px] font-extrabold transition-all',
            editing
              ? 'bg-primary text-white shadow-[0_4px_10px_rgba(42,75,255,0.3)]'
              : 'bg-bg-elevated text-primary shadow-card hover:bg-bg-tinted',
          )}
        >
          {editing ? <IconCheck size={12} stroke={2.5} /> : <IconSettings size={12} stroke={2.5} />}
          {editing ? 'Listo' : 'Editar'}
        </button>
      </div>

      {/* Buckets */}
      <div className="flex flex-col gap-2.5">
        {bucketsWithSpend.map((b) => (
          <BucketCard
            key={b.id}
            bucket={b}
            monthlyIncome={monthlyIncome}
            expanded={expandedId === b.id || editing}
            editing={editing}
            onToggle={() => {
              if (editing) return
              setExpandedId((cur) => (cur === b.id ? null : b.id))
            }}
            onItemDelta={(itemId, delta) => {
              const item = b.items.find((it) => it.id === itemId)
              if (!item) return
              void updateItemPct(itemId, item.pct + delta)
            }}
          />
        ))}
      </div>

      {/* Richeto explainer */}
      <div
        className="flex items-start gap-3 rounded-xl p-3.5 shadow-card"
        style={{
          background:
            'linear-gradient(135deg, var(--color-primary-tint) 0%, var(--color-bg-elevated) 100%)',
        }}
      >
        <Richeto size={56} />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="mb-1 text-[12.5px] font-extrabold text-primary">
            Richeto te explica
          </p>
          <p className="text-[12px] font-medium leading-snug text-text-secondary">
            La regla <b className="text-text">50/30/20</b> es la más usada:{' '}
            <b className="text-text">50%</b> a lo que necesitas,{' '}
            <b className="text-text">30%</b> a tu estilo de vida y{' '}
            <b className="text-text">20%</b> a tu yo del futuro. Toca{' '}
            <b className="text-text">Editar</b> para ajustar cualquier categoría.
          </p>
        </div>
      </div>
    </div>
  )
}
