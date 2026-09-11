import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { BottomNav } from '@/components/BottomNav'
import { Sidebar } from '@/components/Sidebar'
import { PetCompanion } from '@/components/PetCompanion'
import { PwaBanner } from '@/components/PwaBanner'
import { InstallPrompt } from '@/components/InstallPrompt'
import { TransactionFormModal } from '@/components/TransactionFormModal'
import { useUiStore } from '@/store/uiStore'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { useTransactions } from '@/hooks/useTransactions'
import { APP_SCROLL_ID } from '@/lib/appScroll'

/**
 * App shell for protected routes.
 *
 * Mobile  (< 1024px): Single column (max 480px), bottom nav with center FAB.
 * Desktop (≥ 1024px): Sidebar (260px) + flexible main area with mesh gradient bg.
 *
 * The shell is exactly one viewport tall and does not scroll — only `<main>`
 * does. The document used to scroll while `html` and `body` both had
 * `height: 100%`, and WebKit anchors a bottom-positioned fixed element to that
 * body box rather than to the viewport: the nav drifted upward as you scrolled,
 * landing in the middle of the screen with content on both sides of it.
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
  const { pathname } = useLocation()
  const scrollRef = useRef<HTMLElement>(null)

  // The scroller now outlives the route, so without this you arrive at Cuentas
  // already halfway down, wherever Inicio happened to be left.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  const direction = useUiStore((s) => s.addModalDirection)
  const closeAddModal = useUiStore((s) => s.closeAddModal)

  return (
    // `relative` so the nav and the pet can anchor to the shell instead of to
    // the viewport, and `overflow-hidden` so nothing can scroll the document.
    <div className="relative flex h-dvh flex-col overflow-hidden bg-bg gradient-mesh pt-safe">
      <div className="mx-auto flex w-full min-h-0 max-w-[1280px] flex-1">
        {/* Desktop sidebar */}
        <Sidebar />

        {/* Main content — the only thing that scrolls. `min-h-0` is what lets
            a flex child shrink below its content so overflow actually kicks in. */}
        <div className="flex min-w-0 flex-1 flex-col lg:py-4 lg:pr-4">
          <main
            id={APP_SCROLL_ID}
            ref={scrollRef}
            className="mx-auto min-h-0 w-full max-w-[480px] flex-1 overflow-y-auto overscroll-contain pb-28 lg:max-w-none lg:rounded-2xl lg:bg-bg-elevated/60 lg:shadow-card lg:backdrop-blur-sm lg:pb-6 lg:px-6 lg:pt-2"
          >
            <PwaBanner />
            <InstallPrompt />
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
