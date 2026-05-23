import {
  IconHome,
  IconWallet,
  IconArrowsLeftRight,
  IconTarget,
  type Icon,
} from '@tabler/icons-react'

export interface NavTab {
  to: string
  label: string
  icon: Icon
}

/**
 * Bottom-tab and sidebar shared nav structure.
 * Order: Resumen · Cuentas · [FAB] · Plan · Movimientos.
 * Préstamos lives inside the unified /cuentas module as a sub-tab.
 */
export const NAV_TABS: NavTab[] = [
  { to: '/', label: 'Resumen', icon: IconHome },
  { to: '/cuentas', label: 'Cuentas', icon: IconWallet },
  { to: '/plan', label: 'Plan', icon: IconTarget },
  { to: '/movimientos', label: 'Movimientos', icon: IconArrowsLeftRight },
]
