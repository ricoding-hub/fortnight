import {
  IconHome,
  IconWallet,
  IconArrowsLeftRight,
  IconTarget,
  IconUsers,
  type Icon,
} from '@tabler/icons-react'

export interface NavTab {
  to: string
  label: string
  icon: Icon
}

/**
 * Bottom-tab and sidebar shared nav structure. Order matches the design
 * handoff TabBar (shared.jsx). Movimientos is reachable via /movimientos
 * but lives only in the desktop sidebar — mobile bottom nav prioritises
 * Resumen · Plan · [FAB] · Cuentas · Préstamos.
 */
export const NAV_TABS: NavTab[] = [
  { to: '/', label: 'Resumen', icon: IconHome },
  { to: '/plan', label: 'Plan', icon: IconTarget },
  { to: '/cuentas', label: 'Cuentas', icon: IconWallet },
  { to: '/movimientos', label: 'Movimientos', icon: IconArrowsLeftRight },
  { to: '/prestamos', label: 'Préstamos', icon: IconUsers },
]
