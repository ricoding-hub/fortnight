import { IconTrophy } from '@tabler/icons-react'

export interface PodiumFriend {
  name: string
  score: number
  /** Hex avatar colour. */
  avatar: string
}

interface PodiumProps {
  /** Top 3 friends, already sorted desc by score. */
  friends: PodiumFriend[]
}

const PODIUM_COLOR: Record<number, string> = {
  0: '#9B7BFF', // 1st — lavender (champion)
  1: '#B7BFD6', // 2nd — silver
  2: '#E2B58A', // 3rd — bronze
}

/** Visual order on screen: 2nd · 1st · 3rd (the iconic podium layout). */
export function Podium({ friends }: PodiumProps) {
  if (friends.length === 0) return null
  const [first, second, third] = friends
  const ordered = [second, first, third] as const

  return (
    <div className="mb-3 flex items-end justify-center gap-3.5 px-1 pt-1">
      {ordered.map((f, idx) => {
        if (!f) return <div key={`empty-${idx}`} className="flex-1" />
        const rank = idx === 0 ? 1 : idx === 1 ? 0 : 2
        const isFirst = rank === 0
        const barH = isFirst ? 56 : rank === 1 ? 44 : 36
        const color = PODIUM_COLOR[rank]
        return (
          <div key={f.name} className="flex flex-1 flex-col items-center">
            <div
              className="grid place-items-center rounded-full text-white font-display font-extrabold"
              style={{
                width: isFirst ? 50 : 42,
                height: isFirst ? 50 : 42,
                fontSize: isFirst ? 18 : 15,
                background: f.avatar,
                boxShadow: `0 0 0 3px #fff, 0 0 0 5px ${color}`,
                marginBottom: 4,
              }}
            >
              {f.name[0]?.toUpperCase() ?? '?'}
            </div>
            {isFirst && <IconTrophy size={16} stroke={2} color={color} />}
            <p className="mt-0.5 text-[11px] font-bold text-text">{f.name}</p>
            <p className="font-mono text-[10.5px] font-semibold text-text-tertiary">
              {f.score}/10
            </p>
            <div
              className="mt-1.5 grid w-full place-items-center font-display text-base font-extrabold text-white"
              style={{
                height: barH,
                background: color,
                borderRadius: '10px 10px 4px 4px',
                boxShadow: `0 4px 0 ${color}aa`,
              }}
            >
              {rank + 1}
            </div>
          </div>
        )
      })}
    </div>
  )
}
