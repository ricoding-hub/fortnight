import { useMemo, useState } from 'react'
import { IconPlus, IconArrowsLeftRight } from '@tabler/icons-react'
import { useTransactions } from '@/hooks/useTransactions'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { TransactionRow } from '@/components/TransactionRow'
import { TransactionFormModal } from '@/components/TransactionFormModal'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonRow } from '@/components/ui/Skeleton'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { formatDateGroupMX } from '@/lib/format'
import type { Transaction } from '@/types'

/** Splits a date-desc transaction list into consecutive same-date groups. */
function groupByDate(transactions: Transaction[]) {
  const groups: { date: string; items: Transaction[] }[] = []
  for (const tx of transactions) {
    const last = groups[groups.length - 1]
    if (last && last.date === tx.date) last.items.push(tx)
    else groups.push({ date: tx.date, items: [tx] })
  }
  return groups
}

export function Movimientos() {
  const [account, setAccount] = useState('')
  const [category, setCategory] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  const {
    data: transactions,
    loading,
    error,
    create,
    deleteTransaction,
  } = useTransactions({
    accountId: account || undefined,
    categoryId: category || undefined,
    dateFrom: from || undefined,
    dateTo: to || undefined,
  })
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  )
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  )
  const groups = useMemo(() => groupByDate(transactions), [transactions])

  const hasFilters = Boolean(account || category || from || to)
  function clearFilters() {
    setAccount('')
    setCategory('')
    setFrom('')
    setTo('')
  }

  return (
    <div className="flex flex-col animate-[fade-in_300ms_ease-out]">
      <header className="px-4 pb-2 pt-4 lg:pt-2">
        <h1 className="text-lg font-bold text-text">Movimientos</h1>
        <p className="text-xs text-text-secondary">Historial de gastos e ingresos</p>
      </header>

      {/* Filters */}
      <div className="flex flex-col gap-2 px-4 pb-2">
        <div className="grid grid-cols-2 gap-2">
          <Select
            aria-label="Filtrar por cuenta"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value="">Todas las cuentas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filtrar por categoría"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              type="date"
              aria-label="Desde"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <span className="text-xs text-text-tertiary">a</span>
          <div className="flex-1">
            <Input
              type="date"
              aria-label="Hasta"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/8"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-1">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : error ? (
        <div className="p-4">
          <Card className="border-debt/20 bg-debt/5">
            <p className="text-sm font-medium text-debt">
              No se pudieron cargar los movimientos.
            </p>
          </Card>
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={IconArrowsLeftRight}
          title={hasFilters ? 'Sin resultados' : 'Sin movimientos aún'}
          description={
            hasFilters
              ? 'Prueba con otros filtros o limpia la búsqueda.'
              : 'Toca el botón + para registrar tu primer movimiento.'
          }
        />
      ) : (
        <div className="pb-4">
          {groups.map((group) => (
            <section key={group.date}>
              <h2 className="sticky top-0 z-10 bg-bg-elevated/90 px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-widest text-text-secondary backdrop-blur-sm">
                {formatDateGroupMX(group.date)}
              </h2>
              <div>
                {group.items.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    transaction={tx}
                    account={accountById.get(tx.account_id)}
                    category={
                      tx.category_id
                        ? categoryById.get(tx.category_id)
                        : undefined
                    }
                    onDelete={deleteTransaction}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* FAB */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] lg:hidden">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          aria-label="Agregar movimiento"
          className="pointer-events-auto absolute bottom-22 right-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-elevated transition-all hover:bg-primary-deep hover:shadow-glow-primary active:scale-95"
        >
          <IconPlus size={26} />
        </button>
      </div>

      <TransactionFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        accounts={accounts}
        categories={categories}
        onCreate={create}
      />
    </div>
  )
}
