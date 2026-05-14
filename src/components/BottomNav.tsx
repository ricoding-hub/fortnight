import { NavLink, useLocation } from 'react-router-dom'
import {
  IconHome,
  IconWallet,
  IconArrowsLeftRight,
  IconChartLine,
  IconUsers,
  type Icon,
} from '@tabler/icons-react'
import clsx from 'clsx'

interface Tab {
  to: string
  label: string
  icon: Icon
}

export const NAV_TABS: Tab[] = [
  { to: '/', label: 'Resumen', icon: IconHome },
  { to: '/cuentas', label: 'Cuentas', icon: IconWallet },
  { to: '/movimientos', label: 'Movimientos', icon: IconArrowsLeftRight },
  { to: '/proyeccion', label: 'Proyección', icon: IconChartLine },
  { to: '/prestamos', label: 'Préstamos', icon: IconUsers },
]

export function BottomNav() {
  const location = useLocation()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 lg:hidden"
      aria-label="Navegación principal"
    >
      <div className="mx-auto max-w-[480px] border-t border-border-glass glass-strong pb-safe">
        <ul className="flex">
          {NAV_TABS.map(({ to, label, icon: Icon }) => {
            const isActive =
              to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(to)

            return (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  end={to === '/'}
                  className="relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors"
                  aria-current={isActive ? 'page' : undefined}
                >
                  {/* Active pill indicator */}
                  {isActive && (
                    <span className="absolute -top-px left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-primary animate-[scale-in_200ms_ease-out]" />
                  )}
                  <Icon
                    size={22}
                    stroke={1.75}
                    className={clsx(
                      'transition-colors',
                      isActive ? 'text-primary' : 'text-text-secondary',
                    )}
                  />
                  <span
                    className={clsx(
                      isActive ? 'text-primary' : 'text-text-secondary',
                    )}
                  >
                    {label}
                  </span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}
