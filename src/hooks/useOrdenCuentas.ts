import { useState } from 'react'
import { useConfig } from '@/hooks/useConfig'
import type { AccountType } from '@/types'

const CLAVE = 'fortnight:cuentas:primero'

function leerLocal(): AccountType | null {
  try {
    const v = window.localStorage.getItem(CLAVE)
    return v === 'debit' || v === 'credit' ? v : null
  } catch {
    return null
  }
}

function guardarLocal(v: AccountType) {
  try {
    window.localStorage.setItem(CLAVE, v)
  } catch {
    // Sin almacenamiento la preferencia vive sólo en la base.
  }
}

/** La columna aún no existe: la migración 035 no se ha corrido. */
function faltaColumna(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code
  return code === 'PGRST204' || code === '42703'
}

/**
 * Qué sección de cuentas va primero.
 *
 * Se guarda en `user_config.accounts_first` para que el iPhone y la laptop
 * coincidan. Si la migración 035 no se ha corrido, queda en este navegador: la
 * preferencia funciona igual, sólo que no viaja.
 */
export function useOrdenCuentas() {
  const { data: config, update } = useConfig()
  const [local, setLocal] = useState<AccountType | null>(leerLocal)

  const primero: AccountType = config?.accounts_first ?? local ?? 'debit'
  const orden: readonly AccountType[] = primero === 'credit' ? ['credit', 'debit'] : ['debit', 'credit']

  async function setPrimero(v: AccountType) {
    setLocal(v)
    guardarLocal(v)
    try {
      await update({ accounts_first: v })
    } catch (e) {
      if (!faltaColumna(e)) throw e
    }
  }

  return { primero, orden, setPrimero }
}
