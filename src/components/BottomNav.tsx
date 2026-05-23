import { NavLink, useLocation } from 'react-router-dom'
import { IconPlus } from '@tabler/icons-react'
import clsx from 'clsx'
import { useUiStore } from '@/store/uiStore'
import { NAV_TABS, type NavTab } from '@/components/nav'

/**
 * Floating pill tab bar with a raised central "+" FAB.
 * Layout: Resumen · Cuentas · [+] · Plan · Movimientos on mobile.
 * The sidebar handles navigation at ≥lg.
 */
export function BottomNav() {
  const location = useLocation()
  const openAddModal = useUiStore((s) => s.openAddModal)

  const leftTabs = NAV_TABS.filter((t) => t.to === '/' || t.to === '/cuentas')
  const rightTabs = NAV_TABS.filter((t) => t.to === '/plan' || t.to === '/perfil')

  return (
    <nav
      className="fixed inset-x-0 z-40 px-4 lg:hidden"
      style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      aria-label="Navegación principal"
    >
      <div
        className="mx-auto flex max-w-[440px] items-center justify-between rounded-full bg-bg-elevated px-2.5 py-2"
        style={{
          boxShadow:
            '0 12px 30px rgba(26,31,54,0.18), 0 1px 0 rgba(26,31,54,0.05)',
        }}
      >
        {leftTabs.map((tab) => (
          <NavItem key={tab.to} tab={tab} location={location.pathname} />
        ))}

        {/* Center FAB — raised */}
        <button
          type="button"
          onClick={() => openAddModal('spend')}
          aria-label="Agregar movimiento"
          className="grid h-12 w-12 -translate-y-1 cursor-pointer place-items-center rounded-full bg-primary text-white transition-transform active:scale-95"
          style={{ boxShadow: '0 6px 14px rgba(42,75,255,0.4)' }}
        >
          <IconPlus size={22} stroke={2.5} />
        </button>

        {rightTabs.map((tab) => (
          <NavItem key={tab.to} tab={tab} location={location.pathname} />
        ))}
      </div>
    </nav>
  )
}

interface NavItemProps {
  tab: NavTab
  location: string
}

function NavItem({ tab, location }: NavItemProps) {
  const isActive = tab.to === '/' ? location === '/' : location.startsWith(tab.to)
  const Icon = tab.icon
  return (
    <NavLink
      to={tab.to}
      end={tab.to === '/'}
      className="flex min-w-[50px] flex-col items-center gap-0.5 px-2 py-1.5 text-[10.5px] font-bold transition-colors"
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon
        size={20}
        stroke={isActive ? 2.25 : 2}
        className={clsx(isActive ? 'text-primary' : 'text-text-tertiary')}
      />
      <span className={clsx(isActive ? 'text-primary' : 'text-text-tertiary')}>
        {tab.label}
      </span>
    </NavLink>
  )
}
