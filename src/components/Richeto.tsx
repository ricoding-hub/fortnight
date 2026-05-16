import clsx from 'clsx'

interface RichetoProps {
  /** Render size in px (square). */
  size?: number
  /** Disable the bob animation — useful when wrapped in another animated element. */
  bob?: boolean
  /** Adds a soft blue glow ring behind the mascot. */
  withRing?: boolean
  /** Drop-shadow colour for the mascot — defaults to Richeto blue. */
  shadowColor?: string
  className?: string
}

/**
 * Richeto — the cozy mascot. Always rendered as an animated img so the
 * companion feels alive in every surface (advice cards, payday banner,
 * profile, etc). Bob animation port of `fn-bob` from the design tokens.
 */
export function Richeto({
  size = 48,
  bob = true,
  withRing = false,
  shadowColor = 'rgba(42, 75, 255, 0.35)',
  className,
}: RichetoProps) {
  return (
    <div
      className={clsx('relative shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {withRing && (
        <span
          aria-hidden="true"
          className="absolute -inset-1.5 rounded-full bg-primary-soft"
          style={{ boxShadow: '0 8px 22px rgba(42, 75, 255, 0.3)' }}
        />
      )}
      <img
        src="/richeto.png"
        alt="Richeto"
        width={size}
        height={size}
        loading="eager"
        className="relative h-full w-full object-contain"
        style={{
          filter: `drop-shadow(0 6px 14px ${shadowColor})`,
          animation: bob ? 'fn-bob 3.6s ease-in-out infinite' : 'none',
        }}
      />
    </div>
  )
}
