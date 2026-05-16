import { IconPlus } from '@tabler/icons-react'
import { useGoals } from '@/hooks/useGoals'
import { Card } from '@/components/ui/Card'
import { GoalCard } from '@/components/GoalCard'
import { Richeto } from '@/components/Richeto'
import { useToast } from '@/hooks/useToast'

export function Objetivos() {
  const { data: goals, loading } = useGoals()
  const toast = useToast()

  if (loading) {
    return (
      <div className="px-4 pt-2 animate-[fade-in_300ms_ease-out]">
        <div className="h-24 rounded-xl shimmer" />
      </div>
    )
  }

  const totalSaved = goals
    .filter((g) => !g.is_debt)
    .reduce((s, g) => s + g.saved, 0)

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-2 animate-[fade-in_240ms_ease-out]">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <Card
          className="shadow-card"
          style={{
            background:
              'linear-gradient(140deg, var(--color-asset-soft), var(--color-bg-elevated))',
          }}
        >
          <p className="text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-asset-deep">
            Total ahorrado
          </p>
          <p className="mt-1 font-mono text-xl font-semibold text-asset-deep">
            ${Math.round(totalSaved).toLocaleString()}
          </p>
        </Card>
        <Card
          className="shadow-card"
          style={{
            background:
              'linear-gradient(140deg, var(--color-lavender-soft), var(--color-bg-elevated))',
          }}
        >
          <p className="text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-lavender">
            Metas activas
          </p>
          <p className="mt-1 font-display text-xl font-bold text-lavender">
            {goals.length}
          </p>
        </Card>
      </div>

      {/* Goal list */}
      <div className="flex flex-col gap-2.5">
        {goals.length === 0 ? (
          <Card>
            <p className="text-sm text-text-secondary">
              Aún no tienes metas. Crea una para empezar a ahorrar con propósito.
            </p>
          </Card>
        ) : (
          goals.map((g) => <GoalCard key={g.id} goal={g} />)
        )}
      </div>

      {/* Add goal CTA */}
      <button
        type="button"
        onClick={() => toast.info('Próximamente', 'Crear meta llega en la siguiente actualización.')}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-primary/30 px-4 py-4 text-[13px] font-extrabold text-primary transition-colors hover:bg-primary/5"
      >
        <IconPlus size={16} stroke={2.5} /> Nuevo objetivo
      </button>

      {/* Richeto guidance */}
      <div
        className="flex items-start gap-3 rounded-xl p-3.5 shadow-card"
        style={{
          background:
            'linear-gradient(135deg, var(--color-peach-soft) 0%, var(--color-bg-elevated) 100%)',
        }}
      >
        <Richeto size={56} shadowColor="rgba(255,90,95,0.2)" />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="mb-1 text-[12.5px] font-extrabold text-debt-deep">
            Richeto sugiere
          </p>
          <p className="text-[12px] font-medium leading-snug text-text-secondary">
            Una meta clara es <b className="text-text">80% lograda</b>. Empieza con un
            fondo de emergencia de <b className="text-text">3 a 6 meses</b> de gastos.
            Después, súmale ahorros para experiencias.
          </p>
        </div>
      </div>
    </div>
  )
}
