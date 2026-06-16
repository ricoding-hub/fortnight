import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  IconCalendarEvent,
  IconPlus,
  IconWallet,
  IconArrowsLeftRight,
  IconArrowsSort,
  IconChevronRight,
  IconRefresh,
  IconBuildingBank,
} from '@tabler/icons-react'
import { useAccounts } from '@/hooks/useAccounts'
import { useSyncedCredentials } from '@/hooks/useSyncedCredentials'
import { useInstallments } from '@/hooks/useInstallments'
import { AccountCard } from '@/components/AccountCard'
import {
  AccountFormModal,
  type AccountFormMode,
} from '@/components/AccountFormModal'
import { AddAccountChooserModal } from '@/components/AddAccountChooserModal'
import { ConnectBankModal } from '@/components/syncfy/ConnectBankModal'
import { InstallmentCard } from '@/components/InstallmentCard'
import { InstallmentFormModal } from '@/components/InstallmentFormModal'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonRow } from '@/components/ui/Skeleton'
import { Card } from '@/components/ui/Card'
import { useToast } from '@/hooks/useToast'
import { formatMXN } from '@/lib/format'
import type { Account, AccountType, Installment } from '@/types'

interface SectionProps {
  id?: string
  title: string
  type: AccountType
  accounts: Account[]
  installments: Installment[]
  total: number
  reorderMode: boolean
  onSaveBalance: (account: Account, newBalance: number) => Promise<void>
  onEditDetails: (account: Account) => void
  onAdd: (type: AccountType) => void
  onMove: (accountId: string, direction: -1 | 1) => Promise<void>
}

function Section({
  id,
  title,
  type,
  accounts,
  installments,
  total,
  reorderMode,
  onSaveBalance,
  onEditDetails,
  onAdd,
  onMove,
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
          <p className="py-4 text-xs text-text-secondary">
            Sin cuentas de {title.toLowerCase()}.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {accounts.map((a, i) => (
              <li key={a.id}>
                <AccountCard
                  account={a}
                  installments={installments}
                  onSaveBalance={onSaveBalance}
                  onEditDetails={onEditDetails}
                  reorderMode={reorderMode}
                  canMoveUp={i > 0}
                  canMoveDown={i < accounts.length - 1}
                  onMoveUp={() => void onMove(a.id, -1)}
                  onMoveDown={() => void onMove(a.id, 1)}
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
          <IconPlus size={16} /> Agregar cuenta
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
  const { data: installments, markMonthPaid, remove: removeInstallment, create: createInstallment } = useInstallments()
  const [formMode, setFormMode] = useState<AccountFormMode | null>(null)
  const [chooserType, setChooserType] = useState<AccountType | null>(null)
  const [bankModalOpen, setBankModalOpen] = useState(false)
  const [reorderMode, setReorderMode] = useState(false)
  const [syncingAll, setSyncingAll] = useState(false)
  const [installmentFormOpen, setInstallmentFormOpen] = useState(false)
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
  }
  function pickBank() {
    setChooserType(null)
    setBankModalOpen(true)
  }
  function pickManual() {
    const type = chooserType ?? 'debit'
    setChooserType(null)
    setFormMode({ kind: 'create', type })
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
    installments,
    onSaveBalance: updateBalance,
    onEditDetails: (account: Account) => setFormMode({ kind: 'edit', account }),
    onAdd: openChooser,
    onMove: handleMove,
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
              {syncableCredentials.length > 0 && (
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

      {!hasAccounts ? (
        <EmptyState
          icon={IconWallet}
          title="Sin cuentas aún"
          description="Agrega tu primera cuenta para empezar a controlar tus finanzas."
          action={
            <button
              type="button"
              onClick={() => openChooser('debit')}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-text-inverse shadow-card transition-all hover:bg-primary-deep active:scale-[0.97]"
            >
              <IconPlus size={16} /> Agregar cuenta
            </button>
          }
        />
      ) : (
        <>
          <Section id="tour-cuentas-debito" title="Débito" type="debit" accounts={debit} total={debitTotal} reorderMode={reorderMode} {...sectionProps} />
          <Section id="tour-cuentas-credito" title="Crédito" type="credit" accounts={credit} total={creditTotal} reorderMode={reorderMode} {...sectionProps} />
          {hasConnectedBanks && !reorderMode && (
            <div className="px-4 pb-2">
              <Link
                to="/cuentas/bancos"
                className="group flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-primary transition-all hover:border-primary/30 hover:bg-primary/8 active:scale-[0.99]"
              >
                <IconBuildingBank size={16} className="shrink-0" />
                <span className="flex-1 text-sm font-semibold">Gestionar bancos conectados</span>
                <IconChevronRight size={14} className="shrink-0 text-primary/60 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          )}

          {/* Meses sin intereses */}
          <section id="tour-cuentas-msi" className="px-4 pb-2 pt-2">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
                Meses sin intereses
              </h2>
              <button
                type="button"
                onClick={() => setInstallmentFormOpen(true)}
                className="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary-deep transition-colors active:scale-95"
              >
                <IconPlus size={12} stroke={2.5} /> Agregar
              </button>
            </div>
            {installments.length === 0 ? (
              <button
                type="button"
                onClick={() => setInstallmentFormOpen(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-sm font-medium text-primary transition-all hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99]"
              >
                <IconCalendarEvent size={15} />
                Registrar gasto a meses
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                {installments.map((inst) => (
                  <InstallmentCard
                    key={inst.id}
                    installment={inst}
                    onMarkPaid={() => void markMonthPaid(inst.id).catch(() => toast.error('Error', 'No se pudo actualizar'))}
                    onDelete={() => void removeInstallment(inst.id).catch(() => toast.error('Error', 'No se pudo eliminar'))}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setInstallmentFormOpen(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-primary transition-all hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99]"
                >
                  <IconPlus size={16} /> Agregar otro
                </button>
              </div>
            )}
          </section>
        </>
      )}

      <InstallmentFormModal
        open={installmentFormOpen}
        onClose={() => setInstallmentFormOpen(false)}
        onSubmit={createInstallment}
      />

      <AddAccountChooserModal
        open={chooserType !== null}
        type={chooserType ?? 'debit'}
        onClose={() => setChooserType(null)}
        onPickBank={pickBank}
        onPickManual={pickManual}
      />

      <ConnectBankModal
        open={bankModalOpen}
        onClose={() => setBankModalOpen(false)}
      />

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
