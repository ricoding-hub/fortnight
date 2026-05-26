import { type ReactNode, useEffect, useRef, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import clsx from 'clsx'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/**
 * Bottom-sheet modal with glass-morphism backdrop, slide-up animation,
 * and a drag handle for mobile affordance. Constrained to the app column
 * on desktop. Closes on backdrop click, Escape, or swipe-down (visual only).
 */
export function Modal({ open, onClose, title, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)

  // Mount/unmount + enter/exit animation. The synchronous setState on open
  // is intentional: we need the panel in the DOM before scheduling the next
  // frame to apply the entered transform — that's standard modal animation
  // choreography and React Compiler's "no setState in effect" rule can't
  // reason about it.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true)
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => setEntered(true))
        return () => cancelAnimationFrame(r2)
      })
      return () => cancelAnimationFrame(r1)
    } else if (mounted) {
      setEntered(false)
      const timer = setTimeout(() => {
        setMounted(false)
      }, 300) // Match the exit animation duration
      return () => clearTimeout(timer)
    }
  }, [open, mounted])

  // Handle scroll lock and scrollbar width compensation to prevent layout shift
  useEffect(() => {
    if (!mounted) return

    // Calculate scrollbar width
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    
    // Save previous styles
    const prevOverflow = document.body.style.overflow
    const prevPadding = document.body.style.paddingRight

    // Apply scroll lock and padding
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      // Get current padding to add to it if it exists
      const currentPadding = parseInt(window.getComputedStyle(document.body).paddingRight, 10) || 0
      document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    
    return () => {
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPadding
      window.removeEventListener('keydown', onKey)
    }
  }, [mounted, onClose])

  // Focus trap: focus panel on open
  useEffect(() => {
    if (open && panelRef.current) panelRef.current.focus()
  }, [open])

  if (!mounted) return null

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex items-end justify-center transition-opacity duration-300',
        entered ? 'opacity-100' : 'opacity-0',
      )}
      onClick={onClose}
    >
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-[#1A1F36]/35 backdrop-blur-sm" />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={clsx(
          'relative flex w-full max-w-[480px] max-h-[90dvh] flex-col rounded-t-2xl bg-bg-elevated shadow-elevated outline-none transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          entered ? 'translate-y-0' : 'translate-y-full',
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Drag handle */}
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-text-tertiary/40" />

        {/* Fixed header — always visible above the fold */}
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-3">
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-secondary text-text-secondary transition-colors hover:bg-border-strong hover:text-text"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          {children}
        </div>
      </div>
    </div>
  )
}
