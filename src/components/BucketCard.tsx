import { useState } from 'react'
import {
  IconChevronRight,
  IconCircle,
  IconCircleCheck,
  IconLink,
  IconMinus,
  IconPencil,
  IconPlus,
  IconX,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { iconFor } from '@/lib/icons'
import { bucketStats, type BucketWithSpend } from '@/lib/plan'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

interface BucketCardProps {
  bucket: BucketWithSpend
  monthlyIncome: number
  expanded: boolean
  editing: boolean
  onToggle: () => void
  /** Called with the item id + delta (typically ±1 percentage point). */
  onItemDelta: (itemId: string, delta: number) => void
  /** Toggle "paid this cycle" for an item. Only invoked for completable items. */
  onToggleCompletion?: (itemId: string) => void
  /** Upsert a manual real-spend override for an item for this cycle. */
  onSetManualSpend?: (itemId: string, amount: number) => void
  /** Remove the manual override for an item. */
  onClearManualSpend?: (itemId: string) => void
}

export function BucketCard({
  bucket,
  monthlyIncome,
  expanded,
  editing,
  onToggle,
  onItemDelta,
  onToggleCompletion,
  onSetManualSpend,
  onClearManualSpend,
}: BucketCardProps) {
  const stats = bucketStats(bucket, monthlyIncome)
  const over = stats.diff > 0
  const completableItems = bucket.items.filter((it) => it.completable)
  const completedCount = completableItems.filter((it) => it.completed).length

  const [editingRealId, setEditingRealId] = useState<string | null>(null)
  const [realDraft, setRealDraft] = useState('')

  function openManual(itemId: string, currentSpent: number) {
    setEditingRealId(itemId)
    setRealDraft(String(Math.round(currentSpent)))
  }

  function saveManual() {
    if (!editingRealId) return
    const amount = Number(realDraft.replace(/[^0-9.]/g, ''))
    if (Number.isFinite(amount) && amount >= 0) {
      onSetManualSpend?.(editingRealId, amount)
    }
    setEditingRealId(null)
    setRealDraft('')
  }

  function clearManualOverride() {
    if (!editingRealId) return
    onClearManualSpend?.(editingRealId)
    setEditingRealId(null)
    setRealDraft('')
  }

  const editingItem = editingRealId
    ? bucket.items.find((it) => it.id === editingRealId)
    : null

  return (
    <div
      className="overflow-hidden rounded-md bg-bg-elevated p-3.5 shadow-card"
    >
      <button
        type="button"
        onClick={onToggle}
        className={clsx(
          'block w-full text-left',
          editing && 'cursor-default',
        )}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md font-display text-base font-extrabold"
            style={{
              background: bucket.soft_color,
              color: bucket.color,
            }}
          >
            {bucket.pct}
            <span className="text-[10px] opacity-70">%</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-extrabold text-text">{bucket.name}</span>
              <span
                className={clsx(
                  'font-mono text-[11px] font-semibold tabular-nums',
                  over ? 'text-debt-deep' : 'text-asset-deep',
                )}
              >
                {over ? '+' : ''}${Math.abs(Math.round(stats.diff)).toLocaleString()}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-text-tertiary">
              <span>
                real ${Math.round(stats.spent).toLocaleString()} / plan $
                {Math.round(stats.planAmount).toLocaleString()}
              </span>
              {completableItems.length > 0 && (
                <span
                  className="rounded-full px-1.5 py-px text-[10px] font-extrabold"
                  style={{
                    background: completedCount === completableItems.length ? '#D7F2E4' : bucket.soft_color,
                    color: completedCount === completableItems.length ? '#1F8F58' : bucket.color,
                  }}
                >
                  {completedCount}/{completableItems.length} pagados
                </span>
              )}
            </div>
          </div>
          {!editing && (
            <IconChevronRight
              size={16}
              className={clsx(
                'shrink-0 text-text-tertiary transition-transform duration-200',
                expanded && 'rotate-90',
              )}
            />
          )}
        </div>

        {/* Plan-vs-real layered bar */}
        <div className="relative mt-2.5 h-2.5">
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: bucket.soft_color }}
          />
          {/* plan reference marker at 100% (end of bar) */}
          <div
            className="absolute -top-0.5 -bottom-0.5 w-0.5 opacity-40"
            style={{ left: '100%', background: bucket.color }}
          />
          {/* real fill */}
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${Math.min(stats.ratio * 100, 130)}%`,
              background: over
                ? `linear-gradient(90deg, ${bucket.color} 0%, #FF5A5F 100%)`
                : bucket.color,
            }}
          />
        </div>
      </button>

      {expanded && (
        <div
          className={clsx(
            'mt-3 flex flex-col border-t border-bg-secondary pt-3',
            editing ? 'gap-3.5' : 'gap-2 animate-[slide-up_240ms_cubic-bezier(0.4,1.6,0.5,1)]',
          )}
        >
          {bucket.items.map((item) => {
            const Icon = iconFor(item.icon)
            const itemPlan = (monthlyIncome * item.pct) / 100
            const itemSpent = item.spent ?? 0
            const itemDiff = itemSpent - itemPlan
            const itemOver = itemDiff > 0

            if (editing) {
              return (
                <div
                  key={item.id}
                  className="rounded-md p-3"
                  style={{ background: bucket.soft_color }}
                >
                  <div className="mb-2 flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-bg-elevated">
                      <Icon size={14} stroke={2} color={bucket.color} />
                    </div>
                    <span className="flex-1 truncate text-[12.5px] font-bold text-text">
                      {item.name}
                    </span>
                    {item.manual_override && (
                      <span className="rounded-full bg-bg-elevated px-1.5 py-px text-[9px] font-extrabold tracking-wide" style={{ color: bucket.color }}>
                        MANUAL
                      </span>
                    )}
                    <div className="flex items-center gap-1 rounded-full bg-bg-elevated px-1 py-0.5">
                      <StepperButton
                        onClick={() => onItemDelta(item.id, -1)}
                        color={bucket.color}
                        label={`Bajar ${item.name}`}
                      >
                        <IconMinus size={11} stroke={2.5} />
                      </StepperButton>
                      <span
                        className="min-w-[28px] text-center font-mono text-[13px] font-bold tabular-nums"
                        style={{ color: bucket.color }}
                      >
                        {item.pct}%
                      </span>
                      <StepperButton
                        onClick={() => onItemDelta(item.id, 1)}
                        color={bucket.color}
                        label={`Subir ${item.name}`}
                      >
                        <IconPlus size={11} stroke={2.5} />
                      </StepperButton>
                    </div>
                  </div>
                  <div className="flex items-center justify-between font-mono text-[10.5px] font-semibold">
                    <span className="text-text-secondary">
                      Plan ${Math.round(itemPlan).toLocaleString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={itemOver ? 'text-debt-deep' : 'text-asset-deep'}>
                        Real ${Math.round(itemSpent).toLocaleString()} ·{' '}
                        {itemOver ? '+' : ''}${Math.abs(Math.round(itemDiff)).toLocaleString()}
                      </span>
                      {onSetManualSpend && (
                        <button
                          type="button"
                          onClick={() => openManual(item.id, itemSpent)}
                          aria-label={`Editar real de ${item.name}`}
                          className="grid h-6 w-6 place-items-center rounded-full bg-bg-elevated transition-transform active:scale-90"
                          style={{ color: bucket.color }}
                        >
                          <IconPencil size={11} stroke={2.5} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            }

            const canComplete = !!item.completable && !!onToggleCompletion
            const isCompleted = !!item.completed
            return (
              <div
                key={item.id}
                className={clsx(
                  'flex items-center gap-2.5 transition-opacity',
                  isCompleted && 'opacity-55',
                )}
              >
                <div
                  className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md"
                  style={{ background: bucket.soft_color }}
                >
                  <Icon size={15} stroke={2} color={bucket.color} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={clsx(
                        'flex items-center gap-1 text-[12.5px] font-bold text-text',
                        isCompleted && 'line-through',
                      )}
                    >
                      {item.name}
                      {item.auto_from_subscriptions && (
                        <IconLink size={10} className="text-text-tertiary" />
                      )}
                      {item.manual_override && (
                        <span
                          className="rounded-full px-1.5 py-px text-[8.5px] font-extrabold tracking-wide"
                          style={{ background: bucket.soft_color, color: bucket.color }}
                        >
                          MANUAL
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[11.5px] font-semibold tabular-nums">
                      <span className="text-text-tertiary">
                        ${Math.round(itemPlan).toLocaleString()}
                      </span>
                      <span className="mx-1 text-text-tertiary">·</span>
                      <span className={itemOver ? 'text-debt-deep' : 'text-asset-deep'}>
                        {itemOver ? '+' : ''}${Math.abs(Math.round(itemDiff)).toLocaleString()}
                      </span>
                    </span>
                  </div>
                  <div
                    className="relative mt-1 h-1 overflow-hidden rounded-full"
                    style={{ background: bucket.soft_color }}
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{
                        width:
                          itemPlan > 0
                            ? `${Math.min((itemSpent / itemPlan) * 100, 130)}%`
                            : '0%',
                        background: isCompleted ? '#2BB673' : itemOver ? '#FF5A5F' : bucket.color,
                      }}
                    />
                  </div>
                </div>
                {canComplete && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleCompletion?.(item.id) }}
                    aria-label={isCompleted ? `Desmarcar ${item.name}` : `Marcar ${item.name} como pagado`}
                    className="shrink-0 grid h-7 w-7 place-items-center rounded-full transition-transform active:scale-90"
                  >
                    {isCompleted ? (
                      <IconCircleCheck size={20} stroke={2} className="text-asset" />
                    ) : (
                      <IconCircle size={20} stroke={2} className="text-text-tertiary" />
                    )}
                  </button>
                )}
              </div>
            )
          })}

          {!editing && (
            <button
              type="button"
              className="mt-1 inline-flex items-center justify-center gap-1 rounded-md border-[1.5px] border-dashed border-text-tertiary px-3 py-2 text-[11.5px] font-bold text-text-secondary transition-colors hover:bg-bg-secondary"
            >
              <IconPlus size={12} stroke={2.5} /> Agregar categoría
            </button>
          )}
        </div>
      )}

      {/* Manual real-spend modal */}
      {editingItem && (
        <Modal
          open
          onClose={() => setEditingRealId(null)}
          title={`Real de ${editingItem.name}`}
        >
          <p className="mb-3 text-[12.5px] leading-relaxed text-text-secondary">
            Ajusta manualmente el gasto real de este mes. Se usa cuando no pudiste
            registrar los movimientos en transacciones. El monto manual reemplaza
            cualquier total derivado.
          </p>
          <Input
            label="Monto gastado este mes"
            inputMode="decimal"
            autoFocus
            value={realDraft}
            onChange={(e) => setRealDraft(e.target.value.replace(/[^0-9.]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveManual()
            }}
          />
          <div className="mt-4 flex gap-2">
            {editingItem.manual_override && (
              <Button
                variant="ghost"
                onClick={clearManualOverride}
                className="flex-1"
              >
                <IconX size={14} stroke={2.5} /> Quitar manual
              </Button>
            )}
            <Button onClick={saveManual} className="flex-1">
              <IconCircleCheck size={14} stroke={2.5} /> Guardar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function StepperButton({
  onClick,
  color,
  label,
  children,
}: {
  onClick: () => void
  color: string
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-[22px] w-[22px] place-items-center rounded-full transition-transform active:scale-90"
      style={{ border: `1.5px solid ${color}`, color }}
    >
      {children}
    </button>
  )
}
