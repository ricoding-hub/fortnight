import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { useSubscriptions } from '@/hooks/useSubscriptions'
import { SubscriptionCard } from '@/components/SubscriptionCard'
import { SubscriptionFormModal, type SubFormMode } from '@/components/SubscriptionFormModal'
import { Richeto } from '@/components/Richeto'
import { formatMXN } from '@/lib/format'
import type { Subscription } from '@/types'

export function MisSuscripciones() {
  const { data, loading, create, update, remove, totalMonthly, toMonthly } = useSubscriptions()
  const [formMode, setFormMode] = useState<SubFormMode | null>(null)

  const active = data.filter((s) => s.active)
  const inactive = data.filter((s) => !s.active)

  if (loading) {
    return (
      <div className="px-4 pt-3 animate-[fade-in_300ms_ease-out]">
        <div className="h-24 rounded-xl shimmer mb-3" />
        <div className="h-14 rounded-xl shimmer mb-2" />
        <div className="h-14 rounded-xl shimmer" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-24 pt-3 animate-[fade-in_240ms_ease-out]">
      {/* Hero total */}
      <div
        className="relative overflow-hidden rounded-xl p-5 text-white"
        style={{ background: 'linear-gradient(135deg, #6366F1 0%, #9B7BFF 100%)' }}
      >
        <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" />
        <p className="relative text-[10.5px] font-extrabold uppercase tracking-[0.13em] text-white/70">
          Gasto mensual en suscripciones
        </p>
        <p className="relative mt-1.5 font-display text-[36px] font-extrabold leading-none">
          {formatMXN(totalMonthly)}
        </p>
        <p className="relative mt-1 text-[11.5px] font-medium text-white/65">
          {active.length} activa{active.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Active list */}
      {active.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-bg-elevated px-4 py-8 text-center shadow-card">
          <Richeto size={64} />
          <p className="text-[13px] font-medium text-text-secondary">
            No tienes suscripciones registradas. Agrega Netflix, Spotify o cualquier cobro recurrente.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {active.map((sub) => (
            <SubscriptionCard
              key={sub.id}
              sub={sub}
              monthlyAmount={toMonthly(sub)}
              onEdit={(s: Subscription) => setFormMode({ kind: 'edit', sub: s })}
              onDelete={(id: string) => void remove(id)}
            />
          ))}
        </div>
      )}

      {/* Inactive / paused */}
      {inactive.length > 0 && (
        <>
          <p className="text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-text-tertiary">
            Pausadas
          </p>
          <div className="flex flex-col gap-2 opacity-60">
            {inactive.map((sub) => (
              <SubscriptionCard
                key={sub.id}
                sub={sub}
                monthlyAmount={toMonthly(sub)}
                onEdit={(s: Subscription) => setFormMode({ kind: 'edit', sub: s })}
                onDelete={(id: string) => void remove(id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Add CTA */}
      <button
        type="button"
        onClick={() => setFormMode({ kind: 'create' })}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-primary/30 px-4 py-4 text-[13px] font-extrabold text-primary transition-colors hover:bg-primary/5"
      >
        <IconPlus size={16} stroke={2.5} /> Nueva suscripción
      </button>

      {/* Richeto tip */}
      {active.length >= 3 && (
        <div
          className="flex items-start gap-3 rounded-xl p-3.5 shadow-card"
          style={{ background: 'linear-gradient(135deg, var(--color-lavender-soft) 0%, var(--color-bg-elevated) 100%)' }}
        >
          <Richeto size={52} />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="mb-1 text-[12.5px] font-extrabold text-lavender">
              Richeto nota
            </p>
            <p className="text-[12px] font-medium leading-snug text-text-secondary">
              Tienes <b className="text-text">{formatMXN(totalMonthly)}/mes</b> en suscripciones.
              Revisa cuáles realmente usas — cancelar una puede liberar{' '}
              <b className="text-text">{formatMXN(totalMonthly * 12)}/año</b>.
            </p>
          </div>
        </div>
      )}

      {formMode && (
        <SubscriptionFormModal
          mode={formMode}
          onClose={() => setFormMode(null)}
          onCreate={create}
          onUpdate={(id, patch) => update(id, patch)}
        />
      )}
    </div>
  )
}
