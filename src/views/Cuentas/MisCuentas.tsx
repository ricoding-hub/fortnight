import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  IconPlus,
  IconArrowsLeftRight,
  IconArrowsSort,
  IconChevronRight,
  IconRefresh,
  IconBuildingBank,
} from '@tabler/icons-react'
import { useAccounts } from '@/hooks/useAccounts'
import { useSyncedCredentials } from '@/hooks/useSyncedCredentials'
import { useOrdenCuentas } from '@/hooks/useOrdenCuentas'
import { useInstallments } from '@/hooks/useInstallments'
import { useUiStore } from '@/store/uiStore'
import type { EstadosTarjeta } from '@/lib/estadoDeCuenta'
import { AccountCard } from '@/components/AccountCard'
import {
  AccountFormModal,
  type AccountFormMode,
} from '@/components/AccountFormModal'
import { AddAccountChooserModal } from '@/components/AddAccountChooserModal'
import { ConnectBankModal } from '@/components/syncfy/ConnectBankModal'
import { ComingSoonBadge } from '@/components/ComingSoonBadge'
import { BANK_LINKING_ENABLED } from '@/lib/features'
import { Segmented } from '@/components/ui/Segmented'
import { MsiSection } from '@/components/msi/MsiSection'
import { SkeletonRow } from '@/components/ui/Skeleton'
import { Card } from '@/components/ui/Card'
import { useToast } from '@/hooks/useToast'
import { formatMXN } from '@/lib/format'
import type { Account, AccountType } from '@/types'

interface SectionProps {
  id?: string
  title: string
  type: AccountType
  accounts: Account[]
  total: number
  reorderMode: boolean
  onSaveBalance: (account: Account, newBalance: number) => Promise<void>
  onEditDetails: (account: Account) => void
  onAdd: (type: AccountType) => void
  onMove: (accountId: string, direction: -1 | 1) => Promise<void>
  estados: Record<string, EstadosTarjeta>
  onPagar: (accountId: string, monto?: number) => void
  onVerEstado: (accountId: string) => void
}

function Section({
  id,
  title,
  type,
  accounts,
  total,
  reorderMode,
  onSaveBalance,
  onEditDetails,
  onAdd,
  onMove,
  estados,
  onPagar,
  onVerEstado,
}: SectionProps) {
  return (
    <section id={id} className="px-4 py-2">
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
          {title}
        </h2>
        <span className="text-xs font-medium tabular-nums text-text-tertiary">
          {formatMXN(total)}
        </span>
      </div>
      <Card className="px-4 py-1">
        {accounts.length === 0 ? (
          <p className="py-4 text-[13px] text-text-secondary">
            {type === 'credit'
              ? 'Aún no tienes tarjetas de crédito. Agrégalas para ver tu deuda, tu corte y tu fecha de pago.'
              : 'Aún no tienes cuentas de débito. Agrega dónde tienes tu dinero: nómina, ahorro, efectivo.'}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {accounts.map((a, i) => (
              <li key={a.id}>
                <AccountCard
                  account={a}
                  onSaveBalance={onSaveBalance}
                  onEditDetails={onEditDetails}
                  reorderMode={reorderMode}
                  canMoveUp={i > 0}
                  canMoveDown={i < accounts.length - 1}
                  onMoveUp={() => void onMove(a.id, -1)}
                  onMoveDown={() => void onMove(a.id, 1)}
                  estado={estados[a.id]}
                  onPagar={(monto) => onPagar(a.id, monto)}
                  onVerEstado={() => onVerEstado(a.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {!reorderMode && (
        <button
          type="button"
          onClick={() => onAdd(type)}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-primary transition-all hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99]"
        >
          <IconPlus size={16} /> {type === 'credit' ? 'Agregar tarjeta de crédito' : 'Agregar cuenta de débito'}
        </button>
      )}
    </section>
  )
}

export function MisCuentas() {
  const {
    data: accounts,
    loading,
    error,
    create,
    update,
    deleteAccount,
    updateBalance,
    move,
  } = useAccounts()
  const { data: credentials, sync } = useSyncedCredentials()
  const [formMode, setFormMode] = useState<AccountFormMode | null>(null)
  // Abierto y tipo van separados: al cerrar, el tipo se queda y el texto del
  // selector no cambia a «débito» durante la animación de salida.
  const [chooserOpen, setChooserOpen] = useState(false)
  const [chooserType, setChooserType] = useState<AccountType>('debit')
  const { orden, primero, setPrimero } = useOrdenCuentas()
  // El estado de cuenta de cada tarjeta, para decir qué falta pagar.
  const { estados } = useInstallments()
  const abrirPago = useUiStore((s) => s.abrirPago)
  const abrirEstado = useUiStore((s) => s.abrirEstado)
  const [bankModalOpen, setBankModalOpen] = useState(false)
  const [reorderMode, setReorderMode] = useState(false)
  const [syncingAll, setSyncingAll] = useState(false)
  const toast = useToast()

  const syncableCredentials = credentials.filter((c) => c.status !== 'disabled' && c.status !== 'error')
  const hasConnectedBanks = accounts.some((a) => a.source === 'syncfy')

  async function handleMove(id: string, direction: -1 | 1) {
    try {
      await move(id, direction)
    } catch {
      toast.error('Error', 'No se pudo reordenar la cuenta')
    }
  }

  async function syncAll() {
    if (syncableCredentials.length === 0) return
    setSyncingAll(true)
    let totalTx = 0
    const failed: string[] = []
    for (const cred of syncableCredentials) {
      try {
        const result = await sync(cred.id)
        totalTx += result.transactions
      } catch {
        failed.push(cred.institution_name)
      }
    }
    setSyncingAll(false)
    if (failed.length === 0) {
      toast.success(
        'Bancos actualizados',
        totalTx > 0 ? `${totalTx} movimientos nuevos.` : 'Tus cuentas ya están al día.',
      )
    } else {
      toast.error('Sincronización parcial', `No se pudo: ${failed.join(', ')}`)
    }
  }

  function openChooser(type: AccountType) {
    setChooserType(type)
    setChooserOpen(true)
  }
  function pickBank() {
    setChooserOpen(false)
    setBankModalOpen(true)
  }
  function pickManual() {
    setChooserOpen(false)
    setFormMode({ kind: 'create', type: chooserType })
  }
  async function cambiarPrimero(v: AccountType) {
    try {
      await setPrimero(v)
    } catch {
      toast.error('Error', 'No se pudo guardar el orden')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4 animate-[fade-in_300ms_ease-out]">
        <div className="h-5 w-20 rounded shimmer" />
        <SkeletonRow />
        <SkeletonRow />
        <div className="mt-4 h-5 w-20 rounded shimmer" />
        <SkeletonRow />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <Card className="border-debt/20 bg-debt/5">
          <p className="text-sm font-medium text-debt">
            No se pudieron cargar las cuentas.
          </p>
        </Card>
      </div>
    )
  }

  const debit = accounts.filter((a) => a.type === 'debit')
  const credit = accounts.filter((a) => a.type === 'credit')
  const debitTotal = debit.reduce((s, a) => s + a.balance, 0)
  const creditTotal = credit.reduce((s, a) => s + Math.abs(a.balance), 0)

  const sectionProps = {
    onSaveBalance: updateBalance,
    onEditDetails: (account: Account) => setFormMode({ kind: 'edit', account }),
    onAdd: openChooser,
    onMove: handleMove,
    estados,
    onPagar: abrirPago,
    onVerEstado: abrirEstado,
  }

  const hasAccounts = accounts.length > 0

  return (
    <div className="flex flex-col pb-24 animate-[fade-in_300ms_ease-out]">
      {hasAccounts && (
        <div className="px-4 pb-1 pt-1">
          <div className="flex items-stretch gap-2">
            {/* Movimientos: flex-1 so it always has enough space */}
            <Link
              to="/cuentas/movimientos"
              className="group flex flex-1 items-center gap-2.5 rounded-2xl bg-primary/8 px-3 py-2.5 text-primary transition-all hover:bg-primary/12 active:scale-[0.98]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                <IconArrowsLeftRight size={16} />
              </span>
              <span className="flex-1 text-left">
                <span className="block text-[13px] font-bold leading-tight">
                  Movimientos
                </span>
                <span className="block text-[10.5px] font-medium leading-tight text-primary/75">
                  Historial completo
                </span>
              </span>
              <IconChevronRight size={16} className="text-primary/60 transition-transform group-hover:translate-x-0.5" />
            </Link>

            {/* Right-side icon buttons — compact so they never overflow */}
            <div className="flex shrink-0 items-stretch gap-1.5">
              {BANK_LINKING_ENABLED && syncableCredentials.length > 0 && (
                <button
                  type="button"
                  onClick={() => void syncAll()}
                  disabled={syncingAll}
                  aria-label="Sincronizar bancos"
                  title="Sincronizar bancos"
                  className="flex h-auto w-11 items-center justify-center rounded-2xl bg-primary/8 text-primary transition-all hover:bg-primary/12 active:scale-[0.97] disabled:opacity-60"
                >
                  <IconRefresh size={16} className={syncingAll ? 'animate-spin' : ''} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setReorderMode((m) => !m)}
                aria-pressed={reorderMode}
                className={
                  'flex items-center gap-1.5 rounded-2xl px-3 text-[12px] font-bold transition-all active:scale-[0.97] ' +
                  (reorderMode
                    ? 'bg-primary text-white shadow-[0_4px_10px_rgba(99,102,241,0.3)]'
                    : 'bg-bg-secondary text-text-secondary hover:bg-bg-secondary/80')
                }
              >
                <IconArrowsSort size={14} />
                {reorderMode ? 'Listo' : 'Reordenar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!hasAccounts && (
        <p className="px-4 pb-1 pt-2 text-[13px] leading-snug text-text-secondary">
          Empieza por tus cuentas: débito para tu dinero, crédito para tus tarjetas.
        </p>
      )}

      {reorderMode && (
        <div className="flex flex-col gap-1.5 px-4 pb-1 pt-2">
          <p className="text-[12px] font-semibold text-text-secondary">Mostrar primero</p>
          <Segmented
            ariaLabel="Qué cuentas mostrar primero"
            value={primero}
            onChange={(v) => void cambiarPrimero(v)}
            options={[
              { value: 'debit', label: 'Débito' },
              { value: 'credit', label: 'Crédito' },
            ]}
          />
        </div>
      )}

      {orden.map((tipo) =>
        tipo === 'debit' ? (
          <Section key="debit" id="tour-cuentas-debito" title="Débito" type="debit" accounts={debit} total={debitTotal} reorderMode={reorderMode} {...sectionProps} />
        ) : (
          <Section key="credit" id="tour-cuentas-credito" title="Crédito" type="credit" accounts={credit} total={creditTotal} reorderMode={reorderMode} {...sectionProps} />
        ),
      )}

      <>
          {!reorderMode && (
            <div className="px-4 pb-2">
              {BANK_LINKING_ENABLED && hasConnectedBanks ? (
                <Link
                  to="/cuentas/bancos"
                  className="group flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-primary transition-all hover:border-primary/30 hover:bg-primary/8 active:scale-[0.99]"
                >
                  <IconBuildingBank size={16} className="shrink-0" />
                  <span className="flex-1 text-sm font-semibold">Gestionar bancos conectados</span>
                  <IconChevronRight size={14} className="shrink-0 text-primary/60 transition-transform group-hover:translate-x-0.5" />
                </Link>
              ) : !BANK_LINKING_ENABLED ? (
                // Kept visible on purpose: it's the roadmap, not an error.
                <div
                  aria-disabled="true"
                  className="flex items-center gap-3 rounded-2xl border border-dashed border-lavender/40 bg-lavender-soft/40 px-4 py-3"
                >
                  <IconBuildingBank size={16} className="shrink-0 text-lavender-deep" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-text">Conecta tu banco</span>
                      <ComingSoonBadge />
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-text-secondary">
                      Tus cuentas y movimientos se actualizarán solos, sin capturar nada.
                    </span>
                  </span>
                </div>
              ) : null}
            </div>
          )}

          <MsiSection accounts={accounts} updateBalance={updateBalance} />
      </>

      <AddAccountChooserModal
        open={chooserOpen}
        type={chooserType}
        onClose={() => setChooserOpen(false)}
        onPickBank={pickBank}
        onPickManual={pickManual}
      />

      {BANK_LINKING_ENABLED && (
        <ConnectBankModal open={bankModalOpen} onClose={() => setBankModalOpen(false)} />
      )}

      {formMode && (
        <AccountFormModal
          key={
            formMode.kind === 'create'
              ? `create-${formMode.type}`
              : `edit-${formMode.account.id}`
          }
          mode={formMode}
          onClose={() => setFormMode(null)}
          onCreate={create}
          onUpdate={update}
          onDelete={deleteAccount}
        />
      )}
    </div>
  )
}
