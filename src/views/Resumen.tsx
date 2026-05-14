import { useState } from 'react'
import {
  IconWallet,
  IconCreditCard,
  IconCash,
  IconTarget,
  IconSettings,
} from '@tabler/icons-react'

import { useAccounts } from '@/hooks/useAccounts'
import { useLoans } from '@/hooks/useLoans'
import { useCategories } from '@/hooks/useCategories'
import { useTransactions } from '@/hooks/useTransactions'
import { BalanceHero } from '@/components/BalanceHero'
import { QuickActions } from '@/components/QuickActions'
import { StatCard } from '@/components/StatCard'
import { StreakBanner } from '@/components/StreakBanner'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Badge } from '@/components/ui/Badge'
import { SkeletonStatCard } from '@/components/ui/Skeleton'
import { TransactionFormModal } from '@/components/TransactionFormModal'
import { SettingsDrawer } from '@/components/SettingsDrawer'
import { UpdateBalanceModal } from '@/components/UpdateBalanceModal'
import { formatMXN, formatDateMX } from '@/lib/format'
import { calculateScore } from '@/lib/score'
import { daysUntilDayOfMonth } from '@/lib/dates'

/** Progress-bar color by credit utilization ratio. */
function utilizationTone(ratio: number) {
  if (ratio > 0.8) return 'debt' as const
  if (ratio > 0.5) return 'warning' as const
  return 'asset' as const
}

function dueLabel(days: number): string {
  if (days === 0) return 'Vence hoy'
  if (days === 1) return 'Vence mañana'
  return `Vence en ${days} días`
}

export function Resumen() {
  const { data: accounts, loading, error, updateBalance } = useAccounts()
  const { active: activeLoans } = useLoans()
  const { data: categories } = useCategories()
  const { data: recentTx, create: createTx } = useTransactions()
  const [txModalOpen, setTxModalOpen] = useState(false)
  const [txDirection, setTxDirection] = useState<'spend' | 'receive'>('spend')
  const [balanceModalOpen, setBalanceModalOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Skeleton loading state
  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-4 animate-[fade-in_300ms_ease-out]">
        <div className="h-40 rounded-2xl shimmer" />
        <div className="grid grid-cols-2 gap-3">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <Card className="border-debt/20 bg-debt/5">
          <p className="text-sm font-medium text-debt">
            No se pudo cargar el resumen.
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            Revisa tu conexión e intenta de nuevo.
          </p>
        </Card>
      </div>
    )
  }

  const debitAccounts = accounts.filter((a) => a.type === 'debit')
  const creditAccounts = accounts.filter((a) => a.type === 'credit')

  const debitTotal = debitAccounts.reduce((sum, a) => sum + a.balance, 0)
  const creditDebt = creditAccounts.reduce((sum, a) => sum + a.balance, 0)
  const porCobrar = activeLoans.reduce((sum, l) => sum + l.amount, 0)
  const score = calculateScore(accounts)
  const net = debitTotal - creditDebt

  // Credit cards with a payment due within the next 5 days, soonest first.
  const urgent = creditAccounts
    .filter((a) => a.payment_due_day != null)
    .map((a) => ({ account: a, days: daysUntilDayOfMonth(a.payment_due_day!) }))
    .filter((x) => x.days <= 5)
    .sort((a, b) => a.days - b.days)

  const lastUpdated = accounts.reduce<string | null>(
    (latest, a) => (!latest || a.updated_at > latest ? a.updated_at : latest),
    null,
  )

  // Simple streak — count of days. In production this comes from the DB;
  // for now derive from recent transactions as a lightweight proxy.
  const uniqueDays = new Set(recentTx.map((t) => t.date))
  const streak = uniqueDays.size

  return (
    <div className="flex flex-col animate-[fade-in_300ms_ease-out]">
      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-4 lg:pt-2">
        <div>
          <h1 className="text-lg font-bold text-text">Resumen</h1>
          <p className="text-xs text-text-secondary">Tu panorama financiero</p>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-primary/8 hover:text-primary"
          aria-label="Ajustes"
        >
          <IconSettings size={20} />
        </button>
      </header>

      {/* Hero balance */}
      <BalanceHero net={net} />

      {/* Quick actions */}
      <QuickActions
        onAddExpense={() => {
          setTxDirection('spend')
          setTxModalOpen(true)
        }}
        onAddIncome={() => {
          setTxDirection('receive')
          setTxModalOpen(true)
        }}
        onUpdateBalance={() => setBalanceModalOpen(true)}
      />

      {/* Streak banner */}
      {streak > 0 && <StreakBanner streak={streak} />}

      {/* Urgent payment alerts */}
      {urgent.length > 0 && (
        <div className="px-4 pt-3">
          <Card className="border-debt/20 bg-debt/5">
            <div className="flex items-center gap-2">
              <IconCreditCard size={18} className="text-debt" />
              <p className="text-sm font-semibold text-debt">Pago próximo</p>
            </div>
            <ul className="mt-2 flex flex-col gap-1">
              {urgent.map(({ account, days }) => (
                <li
                  key={account.id}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-text">{account.name}</span>
                  <Badge variant="danger">{dueLabel(days)}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 px-4 py-3 lg:grid-cols-4">
        <StatCard
          label="Activos en débito"
          value={formatMXN(debitTotal)}
          tone="asset"
          icon={IconWallet}
        />
        <StatCard
          label="Deuda total"
          value={formatMXN(creditDebt)}
          tone="debt"
          icon={IconCreditCard}
        />
        <StatCard
          label="Por cobrar"
          value={formatMXN(porCobrar)}
          icon={IconCash}
        />
        <StatCard
          label="Score financiero"
          value={`${score} / 10`}
          tone="primary"
          icon={IconTarget}
        />
      </div>

      {/* Credit utilization */}
      <div className="px-4 py-2">
        <Card>
          <p className="mb-3 text-sm font-semibold text-text">Uso de crédito</p>
          {creditAccounts.length === 0 ? (
            <p className="text-xs text-text-secondary">
              Sin tarjetas de crédito registradas.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {creditAccounts.map((a) => {
                const limit = a.credit_limit ?? 0
                const ratio = limit > 0 ? Math.min(a.balance / limit, 1) : 0
                return (
                  <li key={a.id}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium text-text">{a.name}</span>
                      <span className="tabular-nums text-text-secondary">
                        {formatMXN(a.balance)}
                        {limit > 0 ? ` · ${Math.round(ratio * 100)}%` : ''}
                      </span>
                    </div>
                    <ProgressBar
                      value={ratio * 100}
                      color={utilizationTone(ratio)}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Last updated */}
      {lastUpdated && (
        <p className="px-4 py-3 text-center text-[11px] text-text-tertiary">
          Actualizado {formatDateMX(lastUpdated)}
        </p>
      )}

      {/* Transaction modal */}
      <TransactionFormModal
        open={txModalOpen}
        onClose={() => setTxModalOpen(false)}
        accounts={accounts}
        categories={categories}
        onCreate={createTx}
        initialDirection={txDirection}
      />

      {/* Balance inline modal */}
      <UpdateBalanceModal
        open={balanceModalOpen}
        onClose={() => setBalanceModalOpen(false)}
        accounts={accounts}
        onSaveBalance={updateBalance}
      />

      {/* Settings drawer */}
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
