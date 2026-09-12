import { useEffect } from 'react'
import { IconCamera, IconX } from '@tabler/icons-react'
import { lockAppScroll } from '@/lib/appScroll'
import { ModalLayer } from '@/components/ui/ModalLayer'
import { estiloDeCapa, useViewportRect } from '@/hooks/useViewportRect'

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
    // `body` no es quien se desplaza: el armazón es de un viewport de alto y
    // quien se mueve es `<main id="app-scroll">`. Ponerle overflow hidden al
    // body congelaba algo que ya estaba quieto, así que el fondo seguía
    // desplazándose detrás del visor. lockAppScroll sabe dónde mirar.
    const unlock = lockAppScroll()
    return () => {
      window.removeEventListener('keydown', onKey)
      unlock()
    }
  }, [open, onClose])

  if (!open || !src) return null

  return (
    <VisorEnCapa src={src} alt={alt} onClose={onClose} onChange={onChange} />
  )
}

/**
 * Separado para poder usar hooks: el visor sale antes con un early return y
 * los hooks no pueden vivir detrás de una condición.
 */
function VisorEnCapa({ src, alt, onClose, onChange }: Omit<ImageViewerModalProps, 'open' | 'src'> & { src: string }) {
  const rect = useViewportRect(true)
  return (
    <ModalLayer>
    <div
      style={estiloDeCapa(rect)}
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
    </ModalLayer>
  )
}
