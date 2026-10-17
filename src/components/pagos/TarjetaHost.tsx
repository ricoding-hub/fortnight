import { useAccounts } from '@/hooks/useAccounts'
import { useInstallments } from '@/hooks/useInstallments'
import { useUiStore } from '@/store/uiStore'
import { PagarTarjetaModal } from '@/components/pagos/PagarTarjetaModal'
import { EstadoDeCuentaModal } from '@/components/pagos/EstadoDeCuentaModal'

/**
 * Pagar una tarjeta o ver su estado de cuenta, desde cualquier parte de la app.
 * Sólo carga datos mientras está abierto.
 */
export function TarjetaHost() {
  const tarjeta = useUiStore((s) => s.tarjeta)
  if (!tarjeta) return null
  return (
    <TarjetaAbierta
      key={`${tarjeta.accountId}:${tarjeta.vista}:${tarjeta.monto ?? ''}`}
      accountId={tarjeta.accountId}
      vista={tarjeta.vista}
      monto={tarjeta.monto}
    />
  )
}

function TarjetaAbierta({ accountId, vista, monto }: { accountId: string; vista: 'pagar' | 'estado'; monto?: number }) {
  const cerrar = useUiStore((s) => s.cerrarTarjeta)
  const abrirPago = useUiStore((s) => s.abrirPago)
  const abrirEstado = useUiStore((s) => s.abrirEstado)
  const { data: cuentas, loading } = useAccounts()
  const { estados, estadosListos, conCorrecciones } = useInstallments()
  const tarjeta = cuentas.find((c) => c.id === accountId)
  // Las opciones de monto dependen del estado de cuenta: se espera a tenerlo.
  if (loading || !estadosListos || !tarjeta) return null

  return vista === 'pagar' ? (
    <PagarTarjetaModal
      tarjeta={tarjeta}
      estados={estados[accountId]}
      cuentas={cuentas}
      montoInicial={monto}
      onClose={cerrar}
      onVerEstado={() => abrirEstado(accountId)}
    />
  ) : (
    <EstadoDeCuentaModal
      tarjeta={tarjeta}
      estados={estados[accountId]}
      conCorrecciones={conCorrecciones}
      onClose={cerrar}
      onPagar={(m) => abrirPago(accountId, m)}
    />
  )
}
