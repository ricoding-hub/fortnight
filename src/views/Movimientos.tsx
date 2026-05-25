import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { IconArrowsLeftRight } from '@tabler/icons-react'
import { useTransactions } from '@/hooks/useTransactions'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { TransactionRow } from '@/components/TransactionRow'
import { TransactionDetailModal } from '@/components/TransactionDetailModal'
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

/** ISO date (YYYY-MM-DD) for N days before today, in local time. */
function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

const DEFAULT_FROM = isoDaysAgo(30)

export function Movimientos() {
  const [searchParams] = useSearchParams()
  const [account, setAccount] = useState(() => searchParams.get('account') ?? '')
  const [category, setCategory] = useState('')
  // Default window is the last 30 days — the user can widen it via the date
  // pickers or clear filters to load everything.
  const [from, setFrom] = useState(DEFAULT_FROM)
  const [to, setTo] = useState('')
  const [selected, setSelected] = useState<Transaction | null>(null)

  const {
    data: transactions,
    loading,
    error,
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
  const selectedAccountName = account ? accountById.get(account)?.name : undefined
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  )
  const groups = useMemo(() => groupByDate(transactions), [transactions])

  // "Custom" means the user has narrowed beyond the default 30-day floor.
  const isDefaultWindow = from === DEFAULT_FROM && !to
  const hasNonDateFilters = Boolean(account || category)
  const hasFilters = hasNonDateFilters || !isDefaultWindow

  function clearFilters() {
    setAccount('')
    setCategory('')
    setFrom(DEFAULT_FROM)
    setTo('')
  }

  return (
    <div className="flex flex-col animate-[fade-in_300ms_ease-out]">
      {selectedAccountName && (
        <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-2">
          <p className="truncate text-xs font-medium text-text-secondary">
            Mostrando <span className="font-semibold text-text">{selectedAccountName}</span>
          </p>
          <button
            type="button"
            onClick={() => setAccount('')}
            className="shrink-0 rounded-full bg-primary/8 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/12"
          >
            Ver todas
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-2 px-4 pb-2 pt-2">
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
        {isDefaultWindow && !hasNonDateFilters && (
          <p className="px-0.5 text-[11px] text-text-tertiary">
            Mostrando los últimos 30 días · ajusta las fechas para ver más
          </p>
        )}
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
                    onSelect={setSelected}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {selected && (
        <TransactionDetailModal
          transaction={selected}
          account={accountById.get(selected.account_id)}
          category={
            selected.category_id ? categoryById.get(selected.category_id) : undefined
          }
          onClose={() => setSelected(null)}
          onDelete={deleteTransaction}
        />
      )}
    </div>
  )
}
