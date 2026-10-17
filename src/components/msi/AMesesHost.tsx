import { InstallmentFormModal } from '@/components/InstallmentFormModal'
import { useInstallments } from '@/hooks/useInstallments'
import { useUiStore } from '@/store/uiStore'
import type { SemillaMeses } from '@/store/uiStore'

/**
 * «Convertir a meses» un gasto de tarjeta ya registrado, desde cualquier parte
 * de la app. Sólo carga los planes mientras está abierto.
 */
export function AMesesHost() {
  const semilla = useUiStore((s) => s.aMeses)
  if (!semilla) return null
  return <AMesesAbierto key={semilla.txId ?? 'nuevo'} semilla={semilla} />
}

function AMesesAbierto({ semilla }: { semilla: SemillaMeses }) {
  const cerrar = useUiStore((s) => s.cerrarAMeses)
  const { create, movsTarjetas } = useInstallments()
  return <InstallmentFormModal open semilla={semilla} movimientos={movsTarjetas} onClose={cerrar} onSubmit={create} />
}
