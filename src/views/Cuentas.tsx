import { useState } from 'react'
import { IconPlus, IconWallet } from '@tabler/icons-react'
import { useAccounts } from '@/hooks/useAccounts'
import { AccountCard } from '@/components/AccountCard'
import {
  AccountFormModal,
  type AccountFormMode,
} from '@/components/AccountFormModal'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonRow } from '@/components/ui/Skeleton'
import { Card } from '@/components/ui/Card'
import { formatMXN } from '@/lib/format'
import type { Account, AccountType } from '@/types'

interface SectionProps {
  title: string
  type: AccountType
  accounts: Account[]
  total: number
  onSaveBalance: (account: Account, newBalance: number) => Promise<void>
  onEditDetails: (account: Account) => void
  onAdd: (type: AccountType) => void
}

function Section({
  title,
  type,
  accounts,
  total,
  onSaveBalance,
  onEditDetails,
  onAdd,
}: SectionProps) {
  return (
    <section className="px-4 py-2">
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
            {accounts.map((a) => (
              <li key={a.id}>
                <AccountCard
                  account={a}
                  onSaveBalance={onSaveBalance}
                  onEditDetails={onEditDetails}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <button
        type="button"
        onClick={() => onAdd(type)}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-primary transition-all hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99]"
      >
        <IconPlus size={16} /> Agregar cuenta
      </button>
    </section>
  )
}

export function Cuentas() {
  const { data: accounts, loading, error, create, update, deleteAccount, updateBalance } =
    useAccounts()
  const [formMode, setFormMode] = useState<AccountFormMode | null>(null)

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
  const creditTotal = credit.reduce((s, a) => s + a.balance, 0)

  const sectionProps = {
    onSaveBalance: updateBalance,
    onEditDetails: (account: Account) => setFormMode({ kind: 'edit', account }),
    onAdd: (type: AccountType) => setFormMode({ kind: 'create', type }),
  }

  return (
    <div className="flex flex-col animate-[fade-in_300ms_ease-out]">
      <header className="px-4 pb-2 pt-4 lg:pt-2">
        <h1 className="text-lg font-bold text-text">Cuentas</h1>
        <p className="text-xs text-text-secondary">Gestiona tus cuentas de débito y crédito</p>
      </header>

      {accounts.length === 0 ? (
        <EmptyState
          icon={IconWallet}
          title="Sin cuentas aún"
          description="Agrega tu primera cuenta para empezar a controlar tus finanzas."
          action={
            <button
              type="button"
              onClick={() => setFormMode({ kind: 'create', type: 'debit' })}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-text-inverse shadow-card transition-all hover:bg-primary-deep active:scale-[0.97]"
            >
              <IconPlus size={16} /> Agregar cuenta
            </button>
          }
        />
      ) : (
        <>
          <Section title="Débito" type="debit" accounts={debit} total={debitTotal} {...sectionProps} />
          <Section title="Crédito" type="credit" accounts={credit} total={creditTotal} {...sectionProps} />
        </>
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
