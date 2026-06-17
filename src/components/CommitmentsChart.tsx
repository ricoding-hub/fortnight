import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { CommittedPoint } from '@/lib/debt'

interface CommitmentsChartProps {
  data: CommittedPoint[]
}

function fmtK(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Math.round(n)}`
}

export function CommitmentsChart({ data }: CommitmentsChartProps) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barSize={12} barGap={2}>
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
            name === 'msi' ? 'MSI 0%' : 'Pago mín. libre',
          ]}
          cursor={{ fill: 'var(--color-border)', opacity: 0.4 }}
        />
        <Legend
          iconType="circle"
          iconSize={7}
          wrapperStyle={{ fontSize: 10, paddingTop: 6 }}
          formatter={(value: string) => (value === 'msi' ? 'MSI 0%' : 'Revolvente')}
        />
        <Bar dataKey="msi" stackId="a" fill="#6366F1" radius={[0, 0, 3, 3]} />
        <Bar dataKey="revolving" stackId="a" fill="#EF4444" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
