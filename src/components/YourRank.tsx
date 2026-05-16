export interface RankFriend {
  name: string
  score: number
  avatar: string
  /** True for the current user — drives the blue ring outline. */
  you?: boolean
}

interface YourRankProps {
  friends: RankFriend[]
}

/** "Your rank" row anchored under the podium — shows position + gap to next. */
export function YourRank({ friends }: YourRankProps) {
  const sorted = [...friends].sort((a, b) => b.score - a.score)
  const meIdx = sorted.findIndex((f) => f.you)
  if (meIdx === -1) return null
  const me = sorted[meIdx]
  const rank = meIdx + 1
  const next = sorted[meIdx - 1]
  const gap = next ? next.score - me.score : 0

  return (
    <div className="flex items-center gap-2.5 border-t border-bg-secondary pt-3">
      <span className="w-[22px] font-mono text-xs font-bold text-text-tertiary">
        #{rank}
      </span>
      <span
        className="grid h-8 w-8 place-items-center rounded-full text-[13px] font-extrabold text-white"
        style={{
          background: me.avatar,
          boxShadow: '0 0 0 2px var(--color-primary)',
        }}
      >
        {me.name[0]?.toUpperCase() ?? '?'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-text">Tú · {me.name}</p>
        <p className="text-[10.5px] text-text-tertiary">
          {next
            ? `+${gap} ${gap === 1 ? 'punto' : 'puntos'} para alcanzar a ${next.name}`
            : '¡Vas en la cima!'}
        </p>
      </div>
      <span className="font-mono text-[13px] font-semibold tabular-nums">
        {me.score}/10
      </span>
    </div>
  )
}
