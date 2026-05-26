import { useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  IconBuildingBank,
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconRefresh,
  IconShieldLock,
  IconTrash,
} from '@tabler/icons-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/hooks/useToast'
import { useSyncedCredentials } from '@/hooks/useSyncedCredentials'
import { useAccounts } from '@/hooks/useAccounts'
import { BankStatusPill } from '@/components/syncfy/BankStatusPill'
import { ConnectBankModal } from '@/components/syncfy/ConnectBankModal'
import { bankLogoUrl, presetForInstitutionName } from '@/lib/banks'
import type { SyncfyCredential } from '@/types'

/**
 * Full-page subtab listing connected bank credentials and exposing the
 * sync/disconnect actions. Lives at /cuentas/bancos.
 */
export function MisBancos() {
  const { data: credentials, loading, sync, disconnect } = useSyncedCredentials()
  const { data: accounts } = useAccounts()
  const toast = useToast()
  const [openConnect, setOpenConnect] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [syncingAll, setSyncingAll] = useState(false)

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
  const syncable = visible.filter((c) => c.status !== 'error' && c.status !== 'payment_required')
  const hasPaymentIssue = visible.some((c) => c.status === 'payment_required')

  async function onSyncAll() {
    if (syncable.length === 0) return
    setSyncingAll(true)
    let totalTx = 0
    const errors: string[] = []
    for (const cred of syncable) {
      try {
        const result = await sync(cred.id)
        totalTx += result.transactions
      } catch {
        errors.push(cred.institution_name)
      }
    }
    setSyncingAll(false)
    if (errors.length === 0) {
      toast.success(
        'Todos los bancos sincronizados',
        totalTx > 0 ? `${totalTx} movimientos nuevos.` : 'Tus cuentas ya están al día.',
      )
    } else {
      toast.error(
        'Sincronización parcial',
        `No se pudo sincronizar: ${errors.join(', ')}.`,
      )
    }
  }

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
    if (
      !window.confirm(
        `¿Desconectar ${cred.institution_name}? Las cuentas y el historial importado se conservan.`,
      )
    ) {
      return
    }
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
    <div className="flex flex-col gap-3 pb-24 pt-2 animate-[fade-in_300ms_ease-out]">
      {/* Privacy/trust band — always visible to reassure the user. */}
      <div className="px-4">
        <div className="flex items-start gap-2.5 rounded-2xl bg-primary/5 p-3">
          <IconShieldLock size={16} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-[11.5px] leading-snug text-text-secondary">
            Tus credenciales bancarias nunca pasan por Fortnight. La captura
            ocurre dentro del widget de Syncfy (agregador autorizado) y
            nosotros solo guardamos saldos y movimientos.
          </p>
        </div>
      </div>

      {/* Payment-required banner */}
      {hasPaymentIssue && (
        <div className="px-4">
          <div className="flex flex-col gap-2 rounded-2xl border border-warning/20 bg-warning/5 p-3.5">
            <p className="text-[12.5px] font-semibold text-warning-deep">
              Plan de Syncfy vencido o sin créditos
            </p>
            <p className="text-[11.5px] leading-snug text-text-secondary">
              La sincronización bancaria usa Syncfy (Paybook), un servicio de terceros con cuota mensual. Tu plan actual no permite más sincronizaciones.
            </p>
            <a
              href="https://www.syncfy.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 self-start rounded-xl bg-warning/10 px-3.5 py-1.5 text-[12px] font-bold text-warning-deep transition-colors hover:bg-warning/20"
            >
              Gestionar cuenta Syncfy →
            </a>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-2 px-4">
          <div className="h-16 rounded-2xl shimmer" />
          <div className="h-16 rounded-2xl shimmer" />
        </div>
      ) : visible.length === 0 ? (
        <div className="px-4">
          <EmptyState
            icon={IconBuildingBank}
            title="Sin bancos conectados"
            description="Vincula un banco para importar cuentas y movimientos sin captura manual."
            action={
              <button
                type="button"
                onClick={() => setOpenConnect(true)}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-text-inverse shadow-card transition-all hover:bg-primary-deep active:scale-[0.97]"
              >
                <IconPlus size={16} /> Vincular banco
              </button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4">
          {/* Sync all button */}
          {syncable.length > 0 && (
            <button
              type="button"
              onClick={() => void onSyncAll()}
              disabled={syncingAll || busyId !== null}
              className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(99,102,241,0.25)] transition-all hover:bg-primary-deep active:scale-[0.98] disabled:opacity-60"
            >
              <IconRefresh size={16} className={syncingAll ? 'animate-spin' : ''} />
              {syncingAll ? 'Sincronizando…' : 'Actualizar todos los bancos'}
            </button>
          )}

          <Card className="flex flex-col p-0">
            <ul className="divide-y divide-border">
              {visible.map((cred) => (
                <BankRow
                  key={cred.id}
                  credential={cred}
                  accountCount={accountCountByCredential.get(cred.id) ?? 0}
                  busy={busyId === cred.id || syncingAll}
                  onSync={() => void onSync(cred)}
                  onDisconnect={() => void onDisconnect(cred)}
                />
              ))}
            </ul>
          </Card>

          <button
            type="button"
            onClick={() => setOpenConnect(true)}
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-2.5 text-sm font-medium text-primary transition-all hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99]"
          >
            <IconPlus size={16} /> Vincular otro banco
          </button>
        </div>
      )}

      <ConnectBankModal open={openConnect} onClose={() => setOpenConnect(false)} />
    </div>
  )
}

interface BankRowProps {
  credential: SyncfyCredential
  accountCount: number
  busy: boolean
  onSync: () => void
  onDisconnect: () => void
}

function BankRow({
  credential,
  accountCount,
  busy,
  onSync,
  onDisconnect,
}: BankRowProps) {
  const [expanded, setExpanded] = useState(false)
  const preset = presetForInstitutionName(credential.institution_name)

  return (
    <li>
      {/* Collapsed row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-bg-secondary/40"
      >
        <div
          className={
            'flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-sm ' +
            (preset ? 'bg-white' : 'bg-primary/10 text-primary')
          }
        >
          {preset ? (
            <img
              src={bankLogoUrl(preset.domain)}
              alt={preset.name}
              className="h-7 w-7 object-contain"
            />
          ) : (
            <IconBuildingBank size={20} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-text">
              {credential.institution_name}
            </p>
            <BankStatusPill status={credential.status} />
          </div>
          <p className="text-[11px] text-text-tertiary">
            {accountCount} {accountCount === 1 ? 'cuenta' : 'cuentas'}
            {credential.last_synced_at && (
              <>
                {' · '}
                {formatDistanceToNow(new Date(credential.last_synced_at), {
                  locale: es,
                  addSuffix: true,
                })}
              </>
            )}
            {credential.last_sync_transactions != null && credential.last_sync_transactions > 0 && (
              <> · {credential.last_sync_transactions} mov.</>
            )}
          </p>
          {credential.status === 'payment_required' ? (
            <p className="mt-0.5 text-[11px] text-warning-deep">
              Plan de Syncfy vencido — revisa tu cuenta en syncfy.com
            </p>
          ) : credential.last_status_message && credential.status !== 'active' ? (
            <p className="mt-0.5 text-[11px] text-debt">
              {credential.last_status_message}
            </p>
          ) : null}
        </div>
        {expanded ? (
          <IconChevronUp size={14} className="shrink-0 text-text-tertiary" />
        ) : (
          <IconChevronDown size={14} className="shrink-0 text-text-tertiary" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/60 bg-bg-secondary/30 px-3.5 py-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
            <div>
              <dt className="text-text-tertiary">Estado</dt>
              <dd className="font-semibold capitalize text-text">{credential.status.replace('_', ' ')}</dd>
            </div>
            <div>
              <dt className="text-text-tertiary">Cuentas importadas</dt>
              <dd className="font-semibold text-text">
                {credential.last_sync_accounts ?? accountCount}
              </dd>
            </div>
            <div>
              <dt className="text-text-tertiary">Última sincronización</dt>
              <dd className="font-semibold text-text">
                {credential.last_synced_at
                  ? formatDistanceToNow(new Date(credential.last_synced_at), { locale: es, addSuffix: true })
                  : 'Nunca'}
              </dd>
            </div>
            <div>
              <dt className="text-text-tertiary">Movimientos (última)</dt>
              <dd className="font-semibold text-text">
                {credential.last_sync_transactions != null ? credential.last_sync_transactions : '—'}
              </dd>
            </div>
            {credential.last_status_message && (
              <div className="col-span-2">
                <dt className="text-text-tertiary">Mensaje</dt>
                <dd className="font-semibold text-debt">{credential.last_status_message}</dd>
              </div>
            )}
          </dl>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onSync}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary/8 py-2 text-[12px] font-bold text-primary transition-all hover:bg-primary/12 disabled:opacity-50"
            >
              <IconRefresh size={13} className={busy ? 'animate-spin' : ''} />
              Sincronizar
            </button>
            <button
              type="button"
              onClick={onDisconnect}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-debt/8 py-2 text-[12px] font-bold text-debt transition-all hover:bg-debt/12 disabled:opacity-50"
            >
              <IconTrash size={13} />
              Desconectar
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
