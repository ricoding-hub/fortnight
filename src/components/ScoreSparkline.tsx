interface ScoreSparklineProps {
  /** Score values 0..10. Renders left → right. */
  data: number[]
  width?: number
  height?: number
}

/** Last-N score points as an inline SVG sparkline with gradient area fill. */
export function ScoreSparkline({ data, width = 150, height = 28 }: ScoreSparklineProps) {
  if (data.length < 2) {
    // Single data point can't form a path — render the dot only.
    const y = data.length === 1 ? height - (data[0] / 10) * height : height / 2
    return (
      <svg width={width} height={height} className="block overflow-visible">
        <circle cx={width / 2} cy={y} r={3.5} fill="#2A4BFF" stroke="#fff" strokeWidth={2} />
      </svg>
    )
  }

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - (Math.max(0, Math.min(10, v)) / 10) * height
    return [x, y] as const
  })

  const line = points
    .map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`))
    .join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  const [lastX, lastY] = points[points.length - 1]

  return (
    <svg width={width} height={height} className="block overflow-visible">
      <defs>
        <linearGradient id="fn-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2A4BFF" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#2A4BFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#fn-spark-fill)" />
      <path
        d={line}
        stroke="#2A4BFF"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={3.5} fill="#2A4BFF" stroke="#fff" strokeWidth={2} />
    </svg>
  )
}
