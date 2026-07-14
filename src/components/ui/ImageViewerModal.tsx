import { useEffect } from 'react'
import { IconCamera, IconX } from '@tabler/icons-react'

interface ImageViewerModalProps {
  open: boolean
  /** Image URL to show large; when null the viewer is closed. */
  src: string | null
  alt?: string
  onClose: () => void
  /** When provided, shows a "Cambiar foto" action (only for photos you own). */
  onChange?: () => void
}

/**
 * Full-screen photo viewer ("ver en grande"). Tapping any avatar / group photo
 * opens this; the backdrop or the X closes it. If `onChange` is given (your own
 * photo) it offers "Cambiar foto", which hands off to the picker + cropper.
 */
export function ImageViewerModal({ open, src, alt = '', onClose, onChange }: ImageViewerModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open || !src) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#0A0C18]/92 p-6 animate-[fade-in_180ms_ease-out]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Foto'}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <IconX size={20} />
      </button>

      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[70vh] max-w-full rounded-2xl object-contain shadow-elevated"
      />

      {onChange && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onChange()
          }}
          className="mt-6 flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13px] font-bold text-[#1A1F36] transition-transform active:scale-95"
        >
          <IconCamera size={16} stroke={2} /> Cambiar foto
        </button>
      )}
    </div>
  )
}
