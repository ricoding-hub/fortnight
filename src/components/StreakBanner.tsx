import { IconFlame, IconStar } from '@tabler/icons-react'

interface StreakBannerProps {
  /** Number of consecutive days with activity. */
  streak: number
}

function getMessage(streak: number): string {
  if (streak >= 30) return '¡Un mes completo! Eres imparable.'
  if (streak >= 14) return '¡Dos semanas seguidas! Disciplina total.'
  if (streak >= 7) return '¡Una semana completa! Sigue así.'
  if (streak >= 3) return 'Vas por buen camino. ¡No pares!'
  if (streak >= 1) return 'Has empezado. ¡Mantén el ritmo!'
  return 'Registra tu primer movimiento hoy.'
}

export function StreakBanner({ streak }: StreakBannerProps) {
  if (streak <= 0) return null

  const milestone = streak >= 7

  return (
    <div className="mx-4 flex items-center gap-3 rounded-2xl bg-accent/8 px-4 py-3 animate-[scale-in_300ms_ease-out]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15">
        {milestone ? (
          <IconStar size={20} className="text-accent-deep" />
        ) : (
          <IconFlame size={20} className="text-accent-deep" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">
          {streak} {streak === 1 ? 'día' : 'días'} seguidos
        </p>
        <p className="text-xs text-text-secondary">{getMessage(streak)}</p>
      </div>
    </div>
  )
}
