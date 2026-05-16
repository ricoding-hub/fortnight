import type { ProjectionPoint } from '@/lib/goals'

interface PlanChartProps {
  series: ProjectionPoint[]
  /** Hex colour of the in-progress bars. */
  color: string
  /** When true, bars descend (debt payoff); finished = value === 0. */
  isDebt: boolean
  /** Goal target — used to decide which bar is "done" for savings. */
  target: number
}

const H = 140
const AXIS_W = 36

/** Darken a hex by ~30% — used for the bottom-of-bar gradient stop. */
function shade(hex: string): string {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  const f = (n: number) =>
    Math.max(0, Math.floor(n * 0.7))
      .toString(16)
      .padStart(2, '0')
  return `#${f(r)}${f(g)}${f(b)}`
}

function compactMXN(v: number): string {
  if (v >= 1000) return `$${Math.round(v / 1000)}k`
  return v === 0 ? '$0' : `$${Math.round(v)}`
}

const MINT = '#2BB673'
const MINT_DEEP = '#1F8F58'

export function PlanChart({ series, color, isDebt, target }: PlanChartProps) {
  const maxV = Math.max(...series.map((p) => p.value), target)
  // Snap Y-axis to a nice 15k step
  const yMax = Math.max(Math.ceil(maxV / 15000) * 15000, 15000)
  const ticks = [yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0]

  return (
    <div className="flex gap-2">
      {/* Y-axis labels */}
      <div
        className="flex flex-col justify-between"
        style={{ width: AXIS_W, height: H }}
      >
        {ticks.map((t) => (
          <div
            key={t}
            className="text-right font-mono text-[9.5px] font-semibold leading-none text-text-tertiary"
          >
            {compactMXN(t)}
          </div>
        ))}
      </div>

      <div className="relative flex-1">
        {/* Grid lines */}
        <div
          className="pointer-events-none absolute inset-0 flex flex-col justify-between"
          style={{ height: H }}
        >
          {ticks.map((_, i) => (
            <div
              key={i}
              className="h-px"
              style={{
                background: i === ticks.length - 1 ? '#8E91A4' : '#EFEAE0',
                opacity: i === ticks.length - 1 ? 0.25 : 1,
              }}
            />
          ))}
        </div>

        {/* Bars */}
        <div
          className="relative flex items-end gap-1.5 px-1"
          style={{ height: H }}
        >
          {series.map((p, i) => {
            const h = Math.max((p.value / yMax) * H, p.value === 0 ? 3 : 4)
            const done = isDebt ? p.value === 0 : p.value >= target
            const top = done ? MINT : color
            const bot = done ? MINT_DEEP : shade(color)
            return (
              <div
                key={i}
                className="flex h-full flex-1 flex-col items-center justify-end"
              >
                <div
                  style={{
                    width: '100%',
                    maxWidth: 28,
                    height: h,
                    borderRadius: '6px 6px 2px 2px',
                    background: `linear-gradient(180deg, ${top} 0%, ${bot} 100%)`,
                    animation: `slide-up ${300 + i * 60}ms cubic-bezier(0.4, 1.6, 0.5, 1) both`,
                  }}
                />
              </div>
            )
          })}
        </div>

        {/* X-axis labels */}
        <div className="flex gap-1.5 px-1 pt-2">
          {series.map((p, i) => (
            <div
              key={i}
              className="flex-1 text-center text-[10px] font-semibold text-text-tertiary"
            >
              {p.month}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
