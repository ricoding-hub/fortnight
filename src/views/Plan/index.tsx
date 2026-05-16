import { NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'
import { useConfig } from '@/hooks/useConfig'
import { PAY_FREQS, type PayFreq } from '@/lib/paydays'

const TABS = [
  { to: '/plan/presupuesto', label: 'Presupuesto' },
  { to: '/plan/objetivos', label: 'Objetivos' },
  { to: '/plan/proyeccion', label: 'Proyección' },
] as const

export function PlanLayout() {
  const { data: config } = useConfig()
  const freq: PayFreq = (config?.pay_freq ?? 'catorcenal') as PayFreq
  const monthlyIncome = Math.round(
    (config?.pay_amount ?? 0) * PAY_FREQS[freq].cyclesPerMonth,
  )

  return (
    <div className="flex flex-col animate-[fade-in_300ms_ease-out]">
      {/* Header */}
      <header className="flex items-start justify-between px-4 pb-2 pt-3 lg:pt-2">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight text-text">
            Plan
          </h1>
          <p className="mt-0.5 text-[12.5px] font-medium text-text-secondary">
            Tu dinero, con propósito
          </p>
        </div>
        <div className="min-w-[100px] rounded-md bg-bg-elevated px-3 py-2 text-right shadow-card">
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
            Ingreso /mes
          </p>
          <p className="font-mono text-sm font-semibold text-primary">
            ${monthlyIncome.toLocaleString()}
          </p>
        </div>
      </header>

      {/* Sub-nav segmented */}
      <div className="px-4 pb-1 pt-2">
        <div className="grid grid-cols-3 rounded-full bg-bg-secondary p-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                clsx(
                  'rounded-full px-2.5 py-2 text-center text-xs font-bold transition-all duration-200',
                  isActive
                    ? 'bg-bg-elevated text-text shadow-[0_2px_6px_rgba(26,31,54,0.06)]'
                    : 'text-text-secondary hover:text-text',
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      </div>

      <Outlet context={{ monthlyIncome }} />
    </div>
  )
}
