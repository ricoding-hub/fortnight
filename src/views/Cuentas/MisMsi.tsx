import { MsiSection } from '@/components/msi/MsiSection'
import { useAccounts } from '@/hooks/useAccounts'

/**
 * Los meses sin intereses con su propia pestaña en Cuentas. Antes eran el
 * último bloque de la lista de cuentas: con varias tarjetas, más de una
 * pantalla hacia abajo.
 */
export function MisMsi() {
  const { data: accounts, updateBalance } = useAccounts()
  return (
    <div className="flex flex-col pb-24 pt-1 animate-[fade-in_300ms_ease-out]">
      <MsiSection accounts={accounts} updateBalance={updateBalance} />
    </div>
  )
}
