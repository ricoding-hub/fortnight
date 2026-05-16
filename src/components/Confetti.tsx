import { useEffect, useState } from 'react'

interface ConfettiProps {
  /** Number of pieces to throw. Default 18 per the design handoff. */
  count?: number
}

/** Palette pulled from the cozy tokens — blues, mints, corals, lavenders, peach. */
const COLORS = ['#2A4BFF', '#2BB673', '#FF5A5F', '#9B7BFF', '#FFB59E'] as const

interface Piece {
  id: number
  dx: number
  delay: number
  color: string
  size: number
  duration: number
}

/**
 * Confetti burst — 18 lightweight position-absolute pieces that fly outward
 * from the centre and fall using the `fn-confetti-fall` keyframe declared in
 * src/index.css. Pure CSS animation, no JS frame loop.
 *
 * Randomness is generated in a layout effect (not during render) so React
 * Compiler can treat the component as pure. There's a single extra paint on
 * mount before the pieces appear — invisible during the parent's slide-up
 * animation.
 *
 * Mount once inside a position-relative success container; pieces stay
 * pointer-events-none so they never block taps.
 */
export function Confetti({ count = 18 }: ConfettiProps) {
  const [pieces, setPieces] = useState<Piece[]>([])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPieces(
      Array.from({ length: count }, (_, i) => ({
        id: i,
        // Randomise horizontal travel across the full design range (~0..220px).
        dx: (Math.random() - 0.5) * 220,
        delay: Math.random() * 140,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 6,
        duration: 1200 + Math.random() * 600,
      })),
    )
  }, [count])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute left-1/2 top-[20%] rounded-[2px]"
          style={{
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            // Custom property consumed by fn-confetti-fall keyframe.
            ['--dx' as string]: `${p.dx}px`,
            animation: `fn-confetti-fall ${p.duration}ms ease-out ${p.delay}ms forwards`,
          }}
        />
      ))}
    </div>
  )
}
