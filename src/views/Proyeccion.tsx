import { useState } from 'react'
import clsx from 'clsx'
import { addMonths } from 'date-fns'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useAccounts } from '@/hooks/useAccounts'
import { useConfig } from '@/hooks/useConfig'
import { StatCard } from '@/components/StatCard'
import { ConfigFormModal } from '@/components/ConfigFormModal'
import { Card } from '@/components/ui/Card'
import { SkeletonStatCard } from '@/components/ui/Skeleton'
import { IconCreditCard, IconCalendarEvent } from '@tabler/icons-react'
import { formatMXN, formatMonthMX } from '@/lib/format'
import { projectDebtPayoff } from '@/lib/projection'

/** Compact peso label for the chart's Y axis, e.g. 12500 -> "$13k". */
function compactMXN(value: number): string {
  if (value >= 1000) return `$${Math.round(value / 1000)}k`
  return `$${value}`
}

export function Proyeccion() {
  const { data: accounts, loading: accountsLoading, error: accountsError } =
    useAccounts()
  const {
    data: config,
    loading: configLoading,
    error: configError,
    update,
  } = useConfig()
  const [editing, setEditing] = useState(false)

  if (accountsLoading || configLoading) {
    return (
      <div className="flex flex-col gap-3 p-4 animate-[fade-in_300ms_ease-out]">
        <div className="h-40 rounded-2xl shimmer" />
        <div className="grid grid-cols-2 gap-3">
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
      </div>
    )
  }

  if (accountsError || configError) {
    return (
      <div className="p-4">
        <Card className="border-debt/20 bg-debt/5">
          <p className="text-sm font-medium text-debt">
            No se pudo cargar la proyección.
          </p>
        </Card>
      </div>
    )
  }

  const catorcena = config?.catorcena ?? 0
  const vales = config?.vales ?? 0
  const fixedMonthly = config?.fixed_monthly ?? 0
  const variableMonthly = config?.variable_monthly ?? 0

  // CLAUDE.md projection logic.
  const monthlyIncome = catorcena * 2 + vales * 2
  const monthlyDisposable = monthlyIncome - fixedMonthly - variableMonthly

  const totalDebt = accounts
    .filter((a) => a.type === 'credit')
    .reduce((sum, a) => sum + a.balance, 0)

  const points = projectDebtPayoff(totalDebt, monthlyDisposable)
  const reachesZero = points[points.length - 1].debt === 0 && points.length > 1
  const monthsToPayoff = reachesZero ? points.length - 1 : null
  const freeDate =
    monthsToPayoff != null ? addMonths(new Date(), monthsToPayoff) : null

  return (
    <div className="flex flex-col animate-[fade-in_300ms_ease-out]">
      <header className="px-4 pb-1 pt-4 lg:pt-2">
        <h1 className="text-lg font-bold text-text">Proyección</h1>
        <p className="text-xs text-text-secondary">Tu camino libre de deuda</p>
      </header>

      {/* Disposable hero */}
      <section className="px-4 pb-2 pt-3 text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-text-secondary">
          Disponible mensual para deuda
        </p>
        <p
          className={clsx(
            'mt-2 text-4xl font-bold tabular-nums animate-[count-up_600ms_ease-out]',
            monthlyDisposable > 0 ? 'text-asset' : 'text-debt',
          )}
        >
          {formatMXN(monthlyDisposable)}
        </p>
        <p className="mt-1 text-xs text-text-tertiary">
          ingreso − gastos fijos − variables
        </p>
      </section>

      {/* Chart or messages */}
      <div className="px-4 py-2">
        {monthlyDisposable <= 0 ? (
          <Card className="border-warning/20 bg-warning/5">
            <p className="text-sm font-semibold text-warning">
              Sin margen para abonar
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              Tus gastos igualan o superan tu ingreso. Ajusta tus supuestos o
              reduce gastos para proyectar el pago de tu deuda.
            </p>
          </Card>
        ) : totalDebt === 0 ? (
          <Card className="border-asset/20 bg-asset/5">
            <p className="text-sm font-semibold text-asset">Sin deuda 🎉</p>
            <p className="mt-1 text-xs text-text-secondary">
              No tienes deuda de crédito registrada. ¡Vas bien!
            </p>
          </Card>
        ) : (
          <Card>
            <p className="pb-3 text-sm font-semibold text-text">
              Deuda proyectada
            </p>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={points}
                  margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
                >
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: '#6B7194' }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(99,102,241,0.1)' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#6B7194' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={compactMXN}
                    width={44}
                  />
                  <Tooltip
                    formatter={(value) => [formatMXN(Number(value)), 'Deuda']}
                    labelFormatter={(label) => `Mes: ${label}`}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid rgba(99,102,241,0.15)',
                      fontSize: 12,
                      boxShadow: '0 4px 12px rgba(15,13,46,0.08)',
                    }}
                  />
                  <Bar dataKey="debt" radius={[6, 6, 0, 0]}>
                    {points.map((point, i) => (
                      <Cell
                        key={i}
                        fill={point.debt === 0 ? '#10B981' : '#EF4444'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 px-4 py-2">
        <StatCard
          label="Deuda actual"
          value={formatMXN(totalDebt)}
          tone="debt"
          icon={IconCreditCard}
        />
        <StatCard
          label="Mes libre de deuda"
          value={freeDate ? formatMonthMX(freeDate) : '—'}
          icon={IconCalendarEvent}
        />
      </div>

      {/* Assumptions */}
      <div className="px-4 py-2">
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text">Supuestos</p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/8"
            >
              Editar
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
            <Assumption label="Catorcena" value={formatMXN(catorcena)} />
            <Assumption label="Vales" value={formatMXN(vales)} />
            <Assumption
              label="Gastos fijos"
              value={formatMXN(fixedMonthly)}
            />
            <Assumption
              label="Gastos variables"
              value={formatMXN(variableMonthly)}
            />
          </dl>
        </Card>
      </div>

      {editing && (
        <ConfigFormModal
          config={config}
          onClose={() => setEditing(false)}
          onSave={update}
        />
      )}
    </div>
  )
}

function Assumption({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="font-semibold tabular-nums text-text">{value}</dd>
    </div>
  )
}
