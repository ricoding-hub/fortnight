import {
  IconHome,
  IconWallet,
  IconTarget,
  IconUser,
  IconUsers,
  type Icon,
} from '@tabler/icons-react'

export interface NavTab {
  to: string
  label: string
  icon: Icon
}

/**
 * La barra de abajo: Inicio · Cuentas · [+] · Préstamos · Plan. Préstamos
 * estaba a dos toques dentro de Cuentas; Perfil se abre tocando tu foto en
 * Inicio. Movimientos vive dentro de Cuentas (`/cuentas/movimientos`).
 */
export const NAV_TABS: NavTab[] = [
  { to: '/', label: 'Inicio', icon: IconHome },
  { to: '/cuentas', label: 'Cuentas', icon: IconWallet },
  { to: '/prestamos', label: 'Préstamos', icon: IconUsers },
  { to: '/plan', label: 'Plan', icon: IconTarget },
]

/** La barra lateral de escritorio tiene espacio: además, Perfil. */
export const SIDEBAR_TABS: NavTab[] = [...NAV_TABS, { to: '/perfil', label: 'Perfil', icon: IconUser }]

/** ¿Estás en Préstamos (la lista) o dentro de una persona/grupo? */
export const enPrestamos = (path: string) => /^\/prestamos(\/|$)/.test(path)
export const enGrupo = (path: string) => /^\/prestamos\/.+/.test(path)
