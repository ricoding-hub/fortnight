import { Outlet } from 'react-router-dom'
import { BottomNav } from '@/components/BottomNav'
import { Sidebar } from '@/components/Sidebar'

/**
 * App shell for protected routes.
 *
 * Mobile  (< 1024px): Single column (max 480px), bottom nav.
 * Desktop (≥ 1024px): Sidebar (260px) + flexible main area with mesh gradient bg.
 */
export function Layout() {
  return (
    <div className="min-h-svh bg-bg gradient-mesh">
      <div className="mx-auto flex w-full min-h-svh max-w-[1280px]">
        {/* Desktop sidebar */}
        <Sidebar />

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col lg:py-4 lg:pr-4">
          <main className="mx-auto w-full max-w-[480px] flex-1 pb-24 lg:max-w-none lg:rounded-2xl lg:bg-bg-elevated/60 lg:shadow-card lg:backdrop-blur-sm lg:pb-6 lg:px-6 lg:pt-2">
            <Outlet />
          </main>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
