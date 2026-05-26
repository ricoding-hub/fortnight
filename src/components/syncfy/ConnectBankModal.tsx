import { useCallback, useEffect, useRef, useState } from 'react'
import {
  IconBuildingBank,
  IconCheck,
  IconLoader2,
  IconAlertTriangle,
  IconShieldLock,
} from '@tabler/icons-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/hooks/useToast'
import { getSyncfyToken } from '@/lib/syncfy/api'
import {
  openSyncfyWidget,
  destroyWidgetContainer,
  type SyncfyWidgetCredential,
  type SyncfyWidgetInstance,
} from '@/lib/syncfy/widget'
import { useSyncedCredentials } from '@/hooks/useSyncedCredentials'

interface ConnectBankModalProps {
  open: boolean
  onClose: () => void
}

// connecting = widget dismissed, waiting for the async 'success' event.
type Phase = 'idle' | 'loading' | 'widget' | 'connecting' | 'syncing' | 'done' | 'error'

const CONNECTING_TIMEOUT_MS = 60_000

/**
 * Bottom-sheet that walks the user through connecting a bank via the
 * Syncfy widget. The widget itself opens its own overlay; this modal is
 * the staging area: explains what happens, then on tap mounts the widget,
 * and shows progress while we register + import on the server.
 *
 * State machine: idle → loading → widget → connecting → syncing → done.
 * Any step can transition to `error` with a recoverable retry.
 *
 * The `connecting` phase covers the gap between the widget UI closing and
 * the async `success` event arriving — Syncfy dismisses its widget before
 * the credential creation is confirmed, so the user would otherwise see
 * the idle "Continuar" screen while the bank is still processing.
 */
export function ConnectBankModal({ open, onClose }: ConnectBankModalProps) {
  const toast = useToast()
  const { register } = useSyncedCredentials()
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [summary, setSummary] = useState<{ accounts: number; transactions: number } | null>(null)
  const widgetRef = useRef<SyncfyWidgetInstance | null>(null)
  const cancelledRef = useRef(false)
  const connectingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearConnectingTimer() {
    if (connectingTimerRef.current !== null) {
      clearTimeout(connectingTimerRef.current)
      connectingTimerRef.current = null
    }
  }

  // Reset internal state whenever the modal closes — next open starts fresh.
  useEffect(() => {
    if (!open) {
      setPhase('idle')
      setSummary(null)
      setErrorMsg(null)
      cancelledRef.current = true
      clearConnectingTimer()
      try {
        widgetRef.current?.close()
      } catch {
        /* no-op */
      }
      widgetRef.current = null
      // Remove widget container so no invisible DOM blocks interaction.
      destroyWidgetContainer()
      cancelledRef.current = false
    }
    // clearConnectingTimer is a stable inline fn — not a dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onSuccess = useCallback(
    async (cred: SyncfyWidgetCredential) => {
      if (cancelledRef.current) return
      clearConnectingTimer()
      setPhase('syncing')
      try {
        const institutionName =
          cred.organization?.name ?? cred.name ?? 'Banco conectado'
        const result = await register({
          id_credential: cred.id_credential,
          id_site: cred.id_site ?? null,
          institution_name: institutionName,
        })
        if (cancelledRef.current) return
        setSummary({ accounts: result.accounts, transactions: result.transactions })
        setPhase('done')
        toast.success(
          'Banco conectado',
          `${result.accounts} cuentas · ${result.transactions} movimientos`,
        )
      } catch (err) {
        if (cancelledRef.current) return
        const message = err instanceof Error ? err.message : 'reintenta en unos segundos'
        setErrorMsg(message)
        setPhase('error')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [register, toast],
  )

  const startWidget = useCallback(async () => {
    cancelledRef.current = false
    clearConnectingTimer()
    setErrorMsg(null)
    setPhase('loading')
    try {
      const { token } = await getSyncfyToken()
      if (cancelledRef.current) return
      setPhase('widget')
      widgetRef.current = await openSyncfyWidget({
        token,
        onSuccess,
        onError: (err) => {
          if (cancelledRef.current) return
          clearConnectingTimer()
          const message = err instanceof Error ? err.message : 'reintenta en unos segundos'
          setErrorMsg(message)
          setPhase('error')
        },
        onClose: () => {
          if (cancelledRef.current) return
          // Widget UI closed — may be user cancel OR the bank is still
          // processing credentials in the background. Transition to
          // 'connecting' and wait for the 'success' event. A timeout
          // surfaces an error if the bank never responds.
          setPhase((prev) => (prev === 'widget' ? 'connecting' : prev))
          connectingTimerRef.current = setTimeout(() => {
            if (cancelledRef.current) return
            setPhase((prev) => {
              if (prev !== 'connecting') return prev
              return 'error'
            })
            setErrorMsg(
              'El banco tardó demasiado en responder. Verifica tus credenciales y reintenta.',
            )
          }, CONNECTING_TIMEOUT_MS)
        },
      })
    } catch (err) {
      if (cancelledRef.current) return
      const message = err instanceof Error ? err.message : 'reintenta en unos segundos'
      setErrorMsg(message)
      setPhase('error')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSuccess])

  // Cancel from any in-flight phase: mark cancelled, close any open widget,
  // return to idle. The sync phase deliberately cannot be cancelled — the
  // server work is already in flight and aborting client-side would leave
  // the credential half-registered.
  const cancelFlow = useCallback(() => {
    cancelledRef.current = true
    clearConnectingTimer()
    try {
      widgetRef.current?.close()
    } catch {
      /* no-op */
    }
    widgetRef.current = null
    destroyWidgetContainer()
    setPhase('idle')
    setErrorMsg(null)
    // Re-enable callbacks for next attempt.
    cancelledRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Block the modal's own close affordances only while syncing — that phase
  // cannot be safely aborted. All other phases allow the user to walk away.
  const handleModalClose = useCallback(() => {
    if (phase === 'syncing') return
    onClose()
  }, [phase, onClose])

  return (
    <Modal open={open && phase !== 'widget'} onClose={handleModalClose} title="Conectar banco">
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
                  actualicen sin captura manual.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-2xl bg-bg-secondary/60 p-3">
              <IconShieldLock size={16} className="mt-0.5 shrink-0 text-primary" />
              <p className="text-[11.5px] leading-snug text-text-secondary">
                Tus credenciales nunca pasan por Fortnight: la captura ocurre
                dentro del widget de Syncfy, una empresa especializada en
                agregación bancaria.
              </p>
            </div>

            <Button onClick={() => void startWidget()}>Continuar</Button>
            <p className="text-center text-[11px] text-text-tertiary">
              Trabajamos con bancos mexicanos. Si el tuyo no aparece, puedes
              seguir agregando cuentas manualmente.
            </p>
          </>
        )}

        {(phase === 'loading' || phase === 'widget') && (
          <BusyState
            label={
              phase === 'loading'
                ? 'Preparando conexión segura…'
                : 'Sigue los pasos en el widget de Syncfy'
            }
            sublabel={
              phase === 'loading'
                ? 'Esto puede tomar unos segundos. No cierres la app.'
                : 'El widget se abrirá sobre esta pantalla.'
            }
          />
        )}

        {phase === 'connecting' && (
          <BusyState
            label="Verificando credenciales con el banco…"
            sublabel="Esto puede tardar hasta un minuto. No cierres la app."
          />
        )}

        {phase === 'syncing' && (
          <BusyState
            label="Importando cuentas y movimientos…"
            sublabel="No cierres la app — esto puede tardar hasta un minuto."
          />
        )}

        {(phase === 'loading' || phase === 'widget' || phase === 'connecting') && (
          <button
            type="button"
            onClick={cancelFlow}
            className="text-center text-[12.5px] font-semibold text-text-secondary transition-colors hover:text-text"
          >
            Cancelar
          </button>
        )}

        {phase === 'error' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col items-center gap-3 py-1 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-debt/10 text-debt-deep">
                <IconAlertTriangle size={28} />
              </div>
              <div>
                <p className="text-sm font-semibold text-text">
                  No pudimos conectar el banco
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  {errorMsg ?? 'Reintenta en unos segundos.'}
                </p>
              </div>
            </div>
            <Button onClick={() => void startWidget()}>Reintentar</Button>
            <button
              type="button"
              onClick={onClose}
              className="text-center text-[12.5px] font-semibold text-text-secondary transition-colors hover:text-text"
            >
              Cerrar
            </button>
          </div>
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

function BusyState({ label, sublabel }: { label: string; sublabel?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <IconLoader2 size={28} className="animate-spin" />
      </div>
      <div>
        <p className="text-sm font-semibold text-text">{label}</p>
        {sublabel && (
          <p className="mt-1 text-xs text-text-secondary">{sublabel}</p>
        )}
      </div>
    </div>
  )
}
