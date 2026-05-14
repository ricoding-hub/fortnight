import {
  IconMinus,
  IconPlus,
  IconRefresh,
} from '@tabler/icons-react'

interface QuickActionsProps {
  onAddExpense: () => void
  onAddIncome: () => void
  onUpdateBalance: () => void
}

const actions = [
  { key: 'expense', label: 'Gasto', icon: IconMinus, color: 'bg-debt/10 text-debt hover:bg-debt/18' },
  { key: 'income', label: 'Ingreso', icon: IconPlus, color: 'bg-asset/10 text-asset hover:bg-asset/18' },
  { key: 'balance', label: 'Saldo', icon: IconRefresh, color: 'bg-primary/10 text-primary hover:bg-primary/18' },
] as const

export function QuickActions({
  onAddExpense,
  onAddIncome,
  onUpdateBalance,
}: QuickActionsProps) {
  const handlers: Record<string, () => void> = {
    expense: onAddExpense,
    income: onAddIncome,
    balance: onUpdateBalance,
  }

  return (
    <div className="flex items-center justify-center gap-6 px-4 py-4">
      {actions.map(({ key, label, icon: Icon, color }) => (
        <button
          key={key}
          type="button"
          onClick={handlers[key]}
          className="flex flex-col items-center gap-1.5 group"
        >
          <span
            className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-[--duration-fast] active:scale-95 ${color}`}
          >
            <Icon size={22} stroke={2} />
          </span>
          <span className="text-[11px] font-medium text-text-secondary group-hover:text-text transition-colors">
            {label}
          </span>
        </button>
      ))}
    </div>
  )
}
