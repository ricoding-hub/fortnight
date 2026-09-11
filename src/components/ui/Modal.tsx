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
 * Bottom sheet on phones, centred dialog from `lg` up.
 *
 * The sheet used to stay glued to the bottom edge at every width. On a laptop
 * that reads as a panel cut off by the screen, and the only way to reach the
 * submit button was to notice that the inner 480px column scrolls — the rest
 * of the screen is backdrop, where the wheel does nothing. Centring it leaves
 * visible backdrop above and below, so the panel is obviously a dialog with
 * its own scroll, and the action is never hidden behind the viewport edge.
 *
 * Closes on backdrop click, Escape, or swipe-down (visual only).
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
        // From lg the overlay itself scrolls, so the wheel works anywhere on
        // screen. Scrolling only inside the 480px column left the rest of a
        // desktop screen inert, which is what "no deja bajar" meant.
        'lg:block lg:overflow-y-auto',
        entered ? 'opacity-100' : 'opacity-0',
      )}
      onClick={onClose}
    >
      {/* Backdrop with blur. Fixed so it still covers a scrolled overlay, and
          inert so it doesn't swallow the wheel: a fixed element's scroll parent
          is the document, not the overlay, so hovering it froze the page. The
          overlay's own onClick keeps click-to-close working. */}
      <div className="pointer-events-none fixed inset-0 bg-[#1A1F36]/35 backdrop-blur-sm" />

      {/* Centring track: only real from lg, where the overlay scrolls */}
      <div className="contents lg:flex lg:min-h-full lg:items-center lg:justify-center lg:p-6">
        {/* Panel */}
        <div
          ref={panelRef}
          tabIndex={-1}
          className={clsx(
            'relative flex w-full max-w-[480px] max-h-[90dvh] flex-col rounded-t-2xl bg-bg-elevated shadow-elevated outline-none transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
            // No inner cap on desktop: the panel grows and the overlay scrolls.
            'lg:max-h-none lg:rounded-2xl',
            // A full slide-up is a sheet gesture; on desktop the dialog rises.
            entered ? 'translate-y-0' : 'translate-y-full lg:translate-y-3',
          )}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {/* Drag handle — a touch affordance, meaningless with a mouse */}
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-text-tertiary/40 lg:hidden" />

          {/* Header — sticks to the top of the sheet on mobile */}
          <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-3 lg:pt-4">
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

          {/* Body. Scrolls itself on mobile; from lg the overlay does it. */}
          <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] lg:overflow-visible lg:pb-5">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
