import { useEffect, useState } from 'react'
import {
  IconCheck,
  IconX,
  IconAlertCircle,
  IconInfoCircle,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { useToastStore, type Toast } from '@/hooks/useToast'

const ICONS = {
  success: IconCheck,
  error: IconX,
  warning: IconAlertCircle,
  info: IconInfoCircle,
}

const COLORS = {
  success: 'bg-asset text-white',
  error: 'bg-debt text-white',
  warning: 'bg-warning text-white',
  info: 'bg-primary text-white',
}

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((state) => state.removeToast)
  const [isClosing, setIsClosing] = useState(false)

  const IconComponent = ICONS[toast.type]

  useEffect(() => {
    // Determine when to start closing animation based on duration
    const duration = toast.duration ?? 4000
    if (duration <= 0) return

    // Start closing animation 300ms before it's actually removed from the store
    const timer = setTimeout(() => setIsClosing(true), duration - 300)
    return () => clearTimeout(timer)
  }, [toast])

  function handleClose() {
    setIsClosing(true)
    setTimeout(() => removeToast(toast.id), 300)
  }

  return (
    <div
      className={clsx(
        'pointer-events-auto flex items-center gap-3 rounded-2xl bg-bg-elevated p-3 pr-4 shadow-elevated transition-all duration-300',
        isClosing ? 'translate-y-4 opacity-0' : 'animate-[slide-up_300ms_cubic-bezier(0.34,1.56,0.64,1)]',
      )}
      role="alert"
    >
      <div
        className={clsx(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm',
          COLORS[toast.type],
        )}
      >
        <IconComponent size={20} stroke={2} />
      </div>

      <div className="flex flex-col">
        <p className="text-sm font-semibold text-text">{toast.title}</p>
        {toast.message && (
          <p className="text-xs text-text-secondary">{toast.message}</p>
        )}
      </div>

      <button
        type="button"
        onClick={handleClose}
        aria-label="Cerrar notificación"
        className="ml-2 flex h-8 w-8 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-bg-secondary hover:text-text"
      >
        <IconX size={16} />
      </button>
    </div>
  )
}

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts)

  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed bottom-24 left-1/2 z-[100] flex w-full max-w-[400px] -translate-x-1/2 flex-col gap-2 px-4"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
