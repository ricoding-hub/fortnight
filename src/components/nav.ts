import {
  IconHome,
  IconWallet,
  IconTarget,
  IconUser,
  type Icon,
} from '@tabler/icons-react'

export interface NavTab {
  to: string
  label: string
  icon: Icon
}

/**
 * Full nav list — consumed by Sidebar (all items) and BottomNav (subset).
 * Movimientos lives as a subtab inside Cuentas (`/cuentas/movimientos`),
 * so it intentionally doesn't appear at the top level.
 */
export const NAV_TABS: NavTab[] = [
  { to: '/', label: 'Resumen', icon: IconHome },
  { to: '/cuentas', label: 'Cuentas', icon: IconWallet },
  { to: '/plan', label: 'Plan', icon: IconTarget },
  { to: '/perfil', label: 'Perfil', icon: IconUser },
]
