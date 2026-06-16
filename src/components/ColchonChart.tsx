import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { ColchonPoint } from '@/lib/debt'

interface ColchonChartProps {
  data: ColchonPoint[]
}

function fmtK(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Math.round(n)}`
}

export function ColchonChart({ data }: ColchonChartProps) {
  const hasNegative = data.some((d) => d.colchon < 0)
  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)', fontWeight: 600 }}
          axisLine={false}
          tickLine={false}
          interval={2}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmtK}
          width={42}
        />
        <ReferenceLine
          y={0}
          stroke={hasNegative ? '#EF4444' : 'var(--color-border)'}
          strokeDasharray="4 3"
          strokeWidth={1.5}
        />
        <Tooltip
          contentStyle={{
            fontSize: 11,
            borderRadius: 10,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-elevated)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
          formatter={(value, name) => {
            const fmt = typeof value === 'number' ? `$${Math.round(value).toLocaleString()}` : '—'
            if (name === 'colchon') return [fmt, 'Colchón'] as [string, string]
            if (name === 'committed') return [fmt, 'Comprometido'] as [string, string]
            return [fmt, String(name)] as [string, string]
          }}
          cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }}
        />
        <Line
          type="monotone"
          dataKey="colchon"
          stroke="#2BB673"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#2BB673' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
