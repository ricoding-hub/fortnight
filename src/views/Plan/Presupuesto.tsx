import { useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { IconCheck, IconPencil, IconSettings } from '@tabler/icons-react'
import clsx from 'clsx'
import { useBudgetPlan } from '@/hooks/useBudgetPlan'
import { useTransactions } from '@/hooks/useTransactions'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { useSubscriptions } from '@/hooks/useSubscriptions'
import { useBudgetCompletions } from '@/hooks/useBudgetCompletions'
import { useBudgetItemManualSpend } from '@/hooks/useBudgetItemManualSpend'
import { BucketCard } from '@/components/BucketCard'
import { Richeto } from '@/components/Richeto'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { PRESETS, planIntegrityPct, type BucketWithSpend } from '@/lib/plan'
import type { PlanPreset } from '@/types'

interface PlanContext {
  monthlyIncome: number
}

export function Presupuesto() {
  const { monthlyIncome } = useOutletContext<PlanContext>()
  const { data, loading, updateItemPct, applyPlanPreset, renamePersonalPreset } = useBudgetPlan()
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const { totalMonthly: subscriptionsMonthly } = useSubscriptions()
  const { completed, toggle: toggleCompletion } = useBudgetCompletions()
  const { data: manualSpend, setManual, clearManual } = useBudgetItemManualSpend()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [pendingPreset, setPendingPreset] = useState<PlanPreset | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const now = new Date()
  const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dateTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const { data: txs } = useTransactions({ dateFrom, dateTo })

  const subsCategoryId = useMemo(
    () => categories.find((c) => c.name.toLowerCase() === 'suscripciones')?.id ?? null,
    [categories],
  )

  const categorySpend = useMemo(() => {
    const accountTypeMap = new Map(accounts.map((a) => [a.id, a.type]))
    const map = new Map<string, number>()
    for (const tx of txs) {
      if (tx.type === 'adjustment' || !tx.category_id) continue
      const accountType = accountTypeMap.get(tx.account_id)
      let expense = 0
      if (accountType === 'debit' && tx.amount < 0) expense = -tx.amount
      else if (accountType === 'credit' && tx.amount > 0) expense = tx.amount
      if (expense > 0) map.set(tx.category_id, (map.get(tx.category_id) ?? 0) + expense)
    }
    return map
  }, [txs, accounts])

  if (loading || !data) {
    return (
      <div className="px-4.5 pt-2 animate-[fade-in_300ms_ease-out]">
        <div className="h-40 rounded-xl shimmer" />
      </div>
    )
  }

  const isPersonal = data.plan.preset === 'personal'
  const hasPersonalSnapshot = !!data.plan.personal_snapshot
  const personalName = data.plan.personal_name ?? 'Personalizado'

  const bucketsWithSpend: BucketWithSpend[] = data.buckets.map((b) => ({
    ...b,
    items: b.items.map((it) => {
      const isSubs = !!subsCategoryId && it.category_id === subsCategoryId
      const transactionSpend = it.category_id ? (categorySpend.get(it.category_id) ?? 0) : 0
      const manual = manualSpend.get(it.id)
      // Priority: manual override > subscriptions auto > transactions
      const spent = manual ?? (isSubs ? subscriptionsMonthly : transactionSpend)
      return {
        ...it,
        spent,
        auto_from_subscriptions: isSubs && manual === undefined,
        manual_override: manual !== undefined,
        // Every item is markable as "pagado este mes" — covers fixed,
        // variable, and saving items. The user picks whatever they want
        // to track manually.
        completable: true,
        completed: completed.has(it.id),
      }
    }),
  }))

  const totalBudget = monthlyIncome
  const totalSpent = bucketsWithSpend.reduce(
    (s, b) => s + b.items.reduce((s2, it) => s2 + (it.spent ?? 0), 0),
    0,
  )
  const remaining = totalBudget - totalSpent
  const totalPct = planIntegrityPct(data.buckets)
  const balanced = totalPct === 100

  // Build the chip list. Personal first when it has a snapshot.
  const presetChips: Array<{ key: PlanPreset; label: string }> = [
    ...(hasPersonalSnapshot ? [{ key: 'personal' as PlanPreset, label: personalName }] : []),
    ...(Object.entries(PRESETS) as [PlanPreset, (typeof PRESETS)[keyof typeof PRESETS]][]).map(
      ([k, p]) => ({ key: k, label: p.label }),
    ),
  ]

  function handleChipTap(key: PlanPreset) {
    if (data!.plan.preset === key) return  // already active, no-op
    // Confirm when we'd be leaving an unsaved personal preset for a named one.
    // The snapshot is preserved either way, so the confirmation is informational —
    // it just guards against accidental taps.
    if (isPersonal && key !== 'personal') {
      setPendingPreset(key)
      return
    }
    void applyPlanPreset(key)
  }

  function confirmSwitch() {
    if (!pendingPreset) return
    void applyPlanPreset(pendingPreset)
    setPendingPreset(null)
  }

  function startRename() {
    if (!isPersonal) return
    setRenameValue(personalName)
    setRenaming(true)
    requestAnimationFrame(() => renameInputRef.current?.select())
  }

  async function finishRename() {
    if (!renaming) return
    setRenaming(false)
    if (renameValue.trim() && renameValue.trim() !== personalName) {
      await renamePersonalPreset(renameValue.trim())
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-2 animate-[fade-in_240ms_ease-out]">
      {/* Disponible hero with plan integrity ribbon */}
      <div className="gradient-hero-ink relative overflow-hidden rounded-xl p-5 text-white shadow-hero">
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
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: b.color }} />
              <span>{b.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Preset chips (alone — no Editar button mixed in) */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {presetChips.map(({ key, label }) => {
          const active = data.plan.preset === key
          const isPersonalChip = key === 'personal'
          if (active && isPersonalChip && renaming) {
            return (
              <input
                key={key}
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value.slice(0, 24))}
                onBlur={() => void finishRename()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void finishRename()
                  if (e.key === 'Escape') { setRenaming(false); setRenameValue(personalName) }
                }}
                className="shrink-0 rounded-sm bg-text px-2.5 py-2 font-mono text-[11px] font-extrabold text-text-inverse outline-none ring-2 ring-primary/40 min-w-[110px]"
                aria-label="Renombrar preset personal"
              />
            )
          }
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleChipTap(key)}
              className={clsx(
                'inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-2 font-mono text-[11px] font-extrabold transition-all',
                active
                  ? 'bg-text text-text-inverse shadow-[0_4px_10px_rgba(26,31,54,0.2)]'
                  : 'bg-bg-elevated text-text-secondary shadow-card hover:bg-bg-tinted',
              )}
            >
              {active && <IconCheck size={11} stroke={3} />}
              <span className="truncate max-w-[140px]">{label}</span>
              {active && isPersonalChip && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); startRename() }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startRename() }
                  }}
                  aria-label="Renombrar"
                  className="inline-grid place-items-center"
                >
                  <IconPencil size={10} stroke={2.5} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Section header for buckets — Ajustar % lives here, close to what it affects */}
      <div className="mt-1 flex items-center justify-between">
        <h2 className="text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-text-tertiary">
          Tus categorías
        </h2>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold transition-all',
            editing
              ? 'bg-primary text-white shadow-[0_4px_10px_rgba(42,75,255,0.3)]'
              : 'bg-bg-elevated text-primary shadow-card hover:bg-bg-tinted',
          )}
        >
          {editing ? <IconCheck size={12} stroke={2.5} /> : <IconSettings size={12} stroke={2.5} />}
          {editing ? 'Listo' : 'Ajustar %'}
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
            onToggleCompletion={(itemId) => void toggleCompletion(itemId)}
            onSetManualSpend={(itemId, amount) => void setManual(itemId, amount)}
            onClearManualSpend={(itemId) => void clearManual(itemId)}
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
          <p className="mb-1 text-[12.5px] font-extrabold text-primary">Richeto te explica</p>
          <p className="text-[12px] font-medium leading-snug text-text-secondary">
            Tu preset <b className="text-text">{personalName}</b> se guarda automáticamente
            cuando ajustas porcentajes. Puedes regresar a cualquier preset estándar y luego
            volver al tuyo sin perder nada. Toca <b className="text-text">Ajustar %</b> para
            cambiar la distribución y <b className="text-text">Editar real</b> dentro de un
            item para corregir el gasto manualmente.
          </p>
        </div>
      </div>

      <ConfirmModal
        open={pendingPreset !== null}
        title="¿Cambiar de preset?"
        message={`Tu preset «${personalName}» se conserva intacto. Puedes volver a él en cualquier momento tocando su chip.`}
        confirmLabel="Cambiar"
        cancelLabel="Cancelar"
        onConfirm={confirmSwitch}
        onClose={() => setPendingPreset(null)}
      />
    </div>
  )
}
