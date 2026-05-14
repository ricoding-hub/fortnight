import { NavLink, useLocation } from 'react-router-dom'
import { IconPlus } from '@tabler/icons-react'
import clsx from 'clsx'
import { NAV_TABS } from '@/components/BottomNav'

/**
 * Desktop sidebar navigation — visible at lg breakpoint and above.
 * Glass-morphism card with the full nav plus a prominent "Agregar" CTA.
 */
export function Sidebar() {
  const location = useLocation()

  return (
    <aside className="hidden lg:flex lg:w-[260px] lg:shrink-0 lg:flex-col lg:gap-2 lg:p-4">
      {/* Brand */}
      <div className="mb-2 px-3 py-4">
        <h1 className="text-xl font-bold text-primary">Fortnight</h1>
        <p className="mt-0.5 text-xs text-text-secondary">
          Tus finanzas, tu ritmo
        </p>
      </div>

      {/* Nav items */}
      <nav aria-label="Navegación principal">
        <ul className="flex flex-col gap-1">
          {NAV_TABS.map(({ to, label, icon: Icon }) => {
            const isActive =
              to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(to)

            return (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/'}
                  className={clsx(
                    'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-[--duration-fast]',
                    isActive
                      ? 'bg-primary/10 text-primary shadow-sm'
                      : 'text-text-secondary hover:bg-bg-secondary hover:text-text',
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon size={20} stroke={1.75} />
                  {label}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Quick add CTA */}
      <NavLink
        to="/movimientos"
        className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-text-inverse shadow-card transition-all hover:bg-primary-deep hover:shadow-elevated active:scale-[0.97]"
      >
        <IconPlus size={18} />
        Agregar movimiento
      </NavLink>
    </aside>
  )
}
