import { useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { IconPlus, IconRefresh, IconTrash, IconBuildingBank } from '@tabler/icons-react'
import { Card } from '@/components/ui/Card'
import { useToast } from '@/hooks/useToast'
import { useSyncedCredentials } from '@/hooks/useSyncedCredentials'
import { useAccounts } from '@/hooks/useAccounts'
import { BankStatusPill } from '@/components/syncfy/BankStatusPill'
import { ConnectBankModal } from '@/components/syncfy/ConnectBankModal'
import type { SyncfyCredential } from '@/types'

/**
 * Lists the user's connected bank credentials and exposes the actions
 * that mutate them. Mounted inside Profile under "Cuentas conectadas".
 */
export function ConnectedBanksSection() {
  const { data: credentials, sync, disconnect } = useSyncedCredentials()
  const { data: accounts } = useAccounts()
  const toast = useToast()
  const [openConnect, setOpenConnect] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const accountCountByCredential = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of accounts) {
      if (a.syncfy_credential_id) {
        counts.set(a.syncfy_credential_id, (counts.get(a.syncfy_credential_id) ?? 0) + 1)
      }
    }
    return counts
  }, [accounts])

  const visible = credentials.filter((c) => c.status !== 'disabled')

  async function onSync(cred: SyncfyCredential) {
    setBusyId(cred.id)
    try {
      const result = await sync(cred.id)
      toast.success(
        'Sincronización completa',
        result.transactions > 0
          ? `${result.transactions} movimientos nuevos.`
          : 'Tus cuentas ya están al día.',
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'reintenta en unos segundos'
      toast.error('No se pudo sincronizar', message)
    } finally {
      setBusyId(null)
    }
  }

  async function onDisconnect(cred: SyncfyCredential) {
    if (!window.confirm(`¿Desconectar ${cred.institution_name}? Tu historial se conserva.`)) return
    setBusyId(cred.id)
    try {
      await disconnect(cred.id)
      toast.success('Banco desconectado', `${cred.institution_name} fue desvinculado.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'reintenta en unos segundos'
      toast.error('No se pudo desconectar', message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="px-4">
        {visible.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-5 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <IconBuildingBank size={24} />
            </div>
            <div className="px-3">
              <p className="text-sm font-semibold text-text">Sin bancos conectados</p>
              <p className="mt-1 text-[11.5px] text-text-secondary">
                Conecta un banco para importar saldos y movimientos automáticamente.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenConnect(true)}
              className="mt-1 flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse shadow-card transition-all hover:bg-primary-deep active:scale-[0.97]"
            >
              <IconPlus size={16} /> Conectar banco
            </button>
          </Card>
        ) : (
          <Card className="flex flex-col gap-1 p-0">
            <ul className="divide-y divide-border">
              {visible.map((cred) => (
                <li
                  key={cred.id}
                  className="flex items-center gap-3 px-3.5 py-3"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <IconBuildingBank size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-text">
                        {cred.institution_name}
                      </p>
                      <BankStatusPill status={cred.status} />
                    </div>
                    <p className="text-[11px] text-text-tertiary">
                      {accountCountByCredential.get(cred.id) ?? 0} cuentas
                      {cred.last_synced_at && (
                        <>
                          {' · '}
                          {formatDistanceToNow(new Date(cred.last_synced_at), {
                            locale: es,
                            addSuffix: true,
                          })}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void onSync(cred)}
                      disabled={busyId === cred.id}
                      aria-label="Sincronizar ahora"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-secondary disabled:opacity-50"
                    >
                      <IconRefresh
                        size={16}
                        className={busyId === cred.id ? 'animate-spin' : ''}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDisconnect(cred)}
                      disabled={busyId === cred.id}
                      aria-label="Desconectar"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-debt-deep transition-colors hover:bg-debt-soft disabled:opacity-50"
                    >
                      <IconTrash size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setOpenConnect(true)}
              className="flex items-center justify-center gap-1.5 border-t border-border py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
            >
              <IconPlus size={16} /> Conectar banco
            </button>
          </Card>
        )}
      </div>

      <ConnectBankModal open={openConnect} onClose={() => setOpenConnect(false)} />
    </>
  )
}
