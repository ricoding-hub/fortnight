import {
  IconHome,
  IconWallet,
  IconArrowsLeftRight,
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
 * Mobile bottom nav shows: Resumen · Cuentas · [FAB] · Plan · Perfil.
 * Movimientos is sidebar-only on mobile.
 */
export const NAV_TABS: NavTab[] = [
  { to: '/', label: 'Resumen', icon: IconHome },
  { to: '/cuentas', label: 'Cuentas', icon: IconWallet },
  { to: '/plan', label: 'Plan', icon: IconTarget },
  { to: '/movimientos', label: 'Movimientos', icon: IconArrowsLeftRight },
  { to: '/perfil', label: 'Perfil', icon: IconUser },
]
