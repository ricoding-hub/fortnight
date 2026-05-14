import { useCallback, useEffect, useRef } from 'react'
import {
  IconSettings,
  IconLogout,
  IconDownload,
  IconInfoCircle,
  IconX,
  IconChevronRight,
} from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import { useAccounts } from '@/hooks/useAccounts'
import { useTransactions } from '@/hooks/useTransactions'
import { useLoans } from '@/hooks/useLoans'
import { useConfig } from '@/hooks/useConfig'
import { useCategories } from '@/hooks/useCategories'

const APP_VERSION = '1.0.0'

interface SettingsDrawerProps {
  open: boolean
  onClose: () => void
}

export function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  const { user, signOut } = useAuth()
  const { data: accounts } = useAccounts()
  const { data: transactions } = useTransactions()
  const { data: loans } = useLoans()
  const { data: config } = useConfig()
  const { data: categories } = useCategories()
  const backdropRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const handleExport = useCallback(() => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: APP_VERSION,
      user: user
        ? { id: user.id, email: user.email }
        : null,
      accounts,
      transactions,
      loans,
      categories,
      config,
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `fortnight-export-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }, [user, accounts, transactions, loans, categories, config])

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
    } catch {
      // If sign-out fails, just close
    }
    onClose()
  }, [signOut, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] animate-[fade-in_200ms_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className="fixed inset-y-0 right-0 z-50 w-[min(320px,85vw)] bg-bg-elevated shadow-elevated animate-[slide-in-right_300ms_var(--ease-spring)]"
        role="dialog"
        aria-modal="true"
        aria-label="Ajustes"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <IconSettings size={20} className="text-primary" />
            <h2 className="text-base font-semibold text-text">Ajustes</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text"
            aria-label="Cerrar"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* User info */}
        {user && (
          <div className="border-b border-border px-5 py-4">
            <p className="text-sm font-medium text-text truncate">
              {user.email}
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              Sesión activa
            </p>
          </div>
        )}

        {/* Menu items */}
        <nav className="flex flex-col p-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-bg-secondary group"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 text-primary transition-colors group-hover:bg-primary/15">
              <IconDownload size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text">Exportar datos</p>
              <p className="text-xs text-text-secondary">
                Descarga un archivo JSON con toda tu información
              </p>
            </div>
            <IconChevronRight
              size={16}
              className="text-text-tertiary flex-shrink-0"
            />
          </button>

          <button
            onClick={() => void handleSignOut()}
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-debt/5 group"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-debt/8 text-debt transition-colors group-hover:bg-debt/15">
              <IconLogout size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-debt">Cerrar sesión</p>
              <p className="text-xs text-text-secondary">
                Salir de tu cuenta en este dispositivo
              </p>
            </div>
            <IconChevronRight
              size={16}
              className="text-text-tertiary flex-shrink-0"
            />
          </button>
        </nav>

        {/* Footer — version */}
        <div className="absolute inset-x-0 bottom-0 border-t border-border px-5 py-4 pb-safe">
          <div className="flex items-center gap-2 text-text-tertiary">
            <IconInfoCircle size={14} />
            <span className="text-xs">Fortnight v{APP_VERSION}</span>
          </div>
        </div>
      </div>
    </>
  )
}
