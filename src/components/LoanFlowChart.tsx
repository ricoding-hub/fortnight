import {
  Bar,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LoanFlowPoint } from '@/lib/loanFlow'

interface LoanFlowChartProps {
  data: LoanFlowPoint[]
}

function fmtK(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Math.round(n)}`
}

const SERIES_LABELS: Record<string, string> = {
  prestado: 'Prestado',
  recuperado: 'Recuperado',
  pendiente: 'Pendiente',
}

/** Monthly lending flow: bars for money out/in, line for outstanding net. */
export function LoanFlowChart({ data }: LoanFlowChartProps) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barSize={12} barGap={2}>
        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)', fontWeight: 600 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmtK}
          width={42}
        />
        <Tooltip
          contentStyle={{
            fontSize: 11,
            borderRadius: 10,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-elevated)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
          formatter={(value, name) => [
            typeof value === 'number' ? `$${Math.round(value).toLocaleString()}` : '—',
            SERIES_LABELS[String(name)] ?? String(name),
          ]}
          cursor={{ fill: 'var(--color-border)', opacity: 0.4 }}
        />
        <Legend
          iconType="circle"
          iconSize={7}
          wrapperStyle={{ fontSize: 10, paddingTop: 6 }}
          formatter={(value: string) => SERIES_LABELS[value] ?? value}
        />
        <Bar dataKey="prestado" fill="#2A4BFF" radius={[3, 3, 0, 0]} />
        <Bar dataKey="recuperado" fill="#2BB673" radius={[3, 3, 0, 0]} />
        <Line
          type="monotone"
          dataKey="pendiente"
          stroke="#FF5A5F"
          strokeWidth={2}
          strokeDasharray="5 3"
          dot={{ r: 2.5, fill: '#FF5A5F' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
