import { Outlet } from 'react-router-dom'
import { BottomNav } from '@/components/BottomNav'
import { Sidebar } from '@/components/Sidebar'
import { PetCompanion } from '@/components/PetCompanion'
import { TransactionFormModal } from '@/components/TransactionFormModal'
import { useUiStore } from '@/store/uiStore'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { useTransactions } from '@/hooks/useTransactions'

/**
 * App shell for protected routes.
 *
 * Mobile  (< 1024px): Single column (max 480px), bottom nav with center FAB.
 * Desktop (≥ 1024px): Sidebar (260px) + flexible main area with mesh gradient bg.
 *
 * Mounts the add-movement modal once at the shell level so any view (FAB,
 * payday banner, urgent payment alert) can open it via the UI store without
 * each view needing to manage its own modal state.
 */
export function Layout() {
  const { data: accounts, loading: accountsLoading } = useAccounts()
  const { data: categories } = useCategories()
  const { create: createTx } = useTransactions()
  const open = useUiStore((s) => s.addModalOpen)
  const direction = useUiStore((s) => s.addModalDirection)
  const closeAddModal = useUiStore((s) => s.closeAddModal)

  return (
    <div className="min-h-svh bg-bg gradient-mesh pt-safe">
      <div className="mx-auto flex w-full min-h-svh max-w-[1280px]">
        {/* Desktop sidebar */}
        <Sidebar />

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col lg:py-4 lg:pr-4">
          <main className="mx-auto w-full max-w-[480px] flex-1 pb-28 lg:max-w-none lg:rounded-2xl lg:bg-bg-elevated/60 lg:shadow-card lg:backdrop-blur-sm lg:pb-6 lg:px-6 lg:pt-2">
            <Outlet />
          </main>
        </div>
      </div>

      <BottomNav />
      <PetCompanion />

      {/* Global add-movement modal — driven by uiStore */}
      {!accountsLoading && (
        <TransactionFormModal
          open={open}
          onClose={closeAddModal}
          accounts={accounts}
          categories={categories}
          onCreate={createTx}
          initialDirection={direction}
        />
      )}
    </div>
  )
}
