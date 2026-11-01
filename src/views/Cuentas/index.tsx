import { NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'

// Préstamos se fue a la barra de abajo; los MSI tienen su pestaña (antes
// eran lo último de la lista de cuentas).
const TABS = [
  { to: '/cuentas/mis', label: 'Cuentas' },
  { to: '/cuentas/msi', label: 'MSI' },
  { to: '/cuentas/suscripciones', label: 'Recurrentes' },
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
            Tu dinero, tus tarjetas y tus meses sin intereses
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
              id={t.to === '/cuentas/msi' ? 'tour-cuentas-msi' : undefined}
              className={({ isActive }) =>
                clsx(
                  'rounded-full px-2 py-2 text-center text-xs font-bold transition-all duration-200',
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
