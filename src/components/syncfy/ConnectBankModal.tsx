import { useCallback, useEffect, useState } from 'react'
import { IconBuildingBank, IconCheck } from '@tabler/icons-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/hooks/useToast'
import { getSyncfyToken } from '@/lib/syncfy/api'
import {
  openSyncfyWidget,
  type SyncfyWidgetCredential,
} from '@/lib/syncfy/widget'
import { useSyncedCredentials } from '@/hooks/useSyncedCredentials'

interface ConnectBankModalProps {
  open: boolean
  onClose: () => void
}

type Phase = 'idle' | 'loading' | 'widget' | 'syncing' | 'done'

/**
 * Bottom-sheet that walks the user through connecting a bank via the
 * Syncfy widget. The widget itself opens its own overlay; this modal is
 * the staging area: explains what happens, then on tap mounts the widget,
 * and shows progress while we register + import on the server.
 */
export function ConnectBankModal({ open, onClose }: ConnectBankModalProps) {
  const toast = useToast()
  const { register } = useSyncedCredentials()
  const [phase, setPhase] = useState<Phase>('idle')
  const [summary, setSummary] = useState<{ accounts: number; transactions: number } | null>(null)

  // Reset internal state whenever the modal closes — next open starts fresh.
  // The setState calls here are guarded by `open` so they only fire on the
  // open→closed transition (not in a render loop). The Modal component uses
  // the same pattern for its mount/unmount animation choreography.
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase('idle')
      setSummary(null)
    }
  }, [open])

  const onSuccess = useCallback(
    async (cred: SyncfyWidgetCredential) => {
      setPhase('syncing')
      try {
        const institutionName =
          cred.organization?.name ?? cred.name ?? 'Banco conectado'
        const result = await register({
          id_credential: cred.id_credential,
          id_site: cred.id_site ?? null,
          institution_name: institutionName,
        })
        setSummary({ accounts: result.accounts, transactions: result.transactions })
        setPhase('done')
        toast.success(
          'Banco conectado',
          `${result.accounts} cuentas · ${result.transactions} movimientos`,
        )
      } catch (err) {
        setPhase('idle')
        const message = err instanceof Error ? err.message : 'reintenta en unos segundos'
        toast.error('No se pudo conectar', message)
      }
    },
    [register, toast],
  )

  const startWidget = useCallback(async () => {
    setPhase('loading')
    try {
      const { token } = await getSyncfyToken()
      setPhase('widget')
      await openSyncfyWidget({
        token,
        onSuccess,
        onError: () => {
          toast.error('No se pudo conectar', 'reintenta en unos segundos')
          setPhase('idle')
        },
        onClose: () => {
          // User dismissed the widget. If onSuccess already moved us forward
          // (syncing / done), leave the new phase alone — the functional
          // setter reads the current value so we don't need a ref.
          setPhase((prev) => (prev === 'widget' ? 'idle' : prev))
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'reintenta en unos segundos'
      toast.error('No se pudo abrir el widget', message)
      setPhase('idle')
    }
  }, [onSuccess, toast])

  return (
    <Modal open={open} onClose={onClose} title="Conectar banco">
      <div className="flex flex-col gap-4">
        {phase === 'idle' && (
          <>
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <IconBuildingBank size={28} />
              </div>
              <div>
                <p className="text-sm font-semibold text-text">
                  Importa tus cuentas automáticamente
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  Conecta tu banco para que tus saldos y movimientos se
                  actualicen sin captura manual. Tus credenciales nunca pasan
                  por Fortnight: la captura ocurre dentro del widget de
                  Syncfy.
                </p>
              </div>
            </div>
            <Button onClick={() => void startWidget()}>Continuar</Button>
            <p className="text-center text-[11px] text-text-tertiary">
              Trabajamos con bancos mexicanos. Si el tuyo no aparece, puedes
              seguir agregando cuentas manualmente.
            </p>
          </>
        )}

        {phase === 'loading' && (
          <p className="py-6 text-center text-sm text-text-secondary">
            Preparando conexión…
          </p>
        )}

        {phase === 'widget' && (
          <p className="py-6 text-center text-sm text-text-secondary">
            Sigue los pasos en el widget de Syncfy.
          </p>
        )}

        {phase === 'syncing' && (
          <p className="py-6 text-center text-sm text-text-secondary">
            Importando cuentas y movimientos…
          </p>
        )}

        {phase === 'done' && summary && (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-asset/15 text-asset-deep">
              <IconCheck size={28} />
            </div>
            <div>
              <p className="text-sm font-semibold text-text">
                Banco conectado
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                Importamos {summary.accounts} cuentas y {summary.transactions}{' '}
                movimientos.
              </p>
            </div>
            <Button onClick={onClose}>Listo</Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
