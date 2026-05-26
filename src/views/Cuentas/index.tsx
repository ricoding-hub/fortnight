import { NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'

const TABS = [
  { to: '/cuentas/mis', label: 'Cuentas' },
  { to: '/cuentas/bancos', label: 'Bancos' },
  { to: '/cuentas/suscripciones', label: 'Suscripciones' },
  { to: '/cuentas/prestamos', label: 'Préstamos' },
] as const

export function CuentasLayout() {
  return (
    <div className="flex flex-col animate-[fade-in_300ms_ease-out]">
      {/* Header */}
      <header className="flex items-start justify-between px-4 pb-2 pt-3 lg:pt-2">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight text-text">
            Cuentas
          </h1>
          <p className="mt-0.5 text-[12.5px] font-medium text-text-secondary">
            Tu dinero y lo que te deben
          </p>
        </div>
      </header>

      {/* Sub-nav segmented */}
      <div className="px-4 pb-1 pt-2">
        <div className="grid grid-cols-4 rounded-full bg-bg-secondary p-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                clsx(
                  'rounded-full px-2 py-2 text-center text-[11px] font-bold transition-all duration-200',
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

      <Outlet />
    </div>
  )
}
