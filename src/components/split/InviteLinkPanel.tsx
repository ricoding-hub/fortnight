import { useRef, useState } from 'react'
import { IconCheck, IconCopy, IconShare } from '@tabler/icons-react'
import clsx from 'clsx'

interface InviteLinkPanelProps {
  link: string
  /** Título de la hoja nativa de compartir. */
  tituloCompartir: string
  /** Qué pasa cuando alguien lo abre; una línea. */
  explicacion: string
}

/**
 * El enlace de invitación, visible.
 *
 * Antes era un solo botón que intentaba compartir y, si la hoja nativa se
 * cerraba —también al cancelarla—, copiaba en silencio. El enlace nunca se veía,
 * así que si fallaban las dos cosas no había nada que copiar a mano. Aquí el
 * enlace está escrito, y compartir y copiar son dos botones distintos.
 */
export function InviteLinkPanel({ link, tituloCompartir, explicacion }: InviteLinkPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [copiado, setCopiado] = useState(false)
  const [aviso, setAviso] = useState('')
  const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  function seleccionar() {
    inputRef.current?.focus()
    inputRef.current?.select()
  }

  async function copiar() {
    setAviso('')
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      seleccionar()
      setAviso('No se pudo copiar solo. El enlace quedó seleccionado: cópialo tú.')
    }
  }

  async function compartir() {
    setAviso('')
    try {
      await navigator.share({ title: tituloCompartir, url: link })
    } catch (e) {
      // Cerrar la hoja es una decisión, no un error: no se copia nada a escondidas.
      if (e instanceof DOMException && e.name === 'AbortError') return
      await copiar()
    }
  }

  const base =
    'inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-bold transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none'

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-primary-soft/30 p-3">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          Enlace de invitación
        </span>
        <input
          ref={inputRef}
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 w-full rounded-xl border border-border bg-bg-elevated px-3 font-mono text-[12px] text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      </label>
      <div className={clsx('grid gap-2', puedeCompartir ? 'grid-cols-2' : 'grid-cols-1')}>
        {puedeCompartir && (
          <button
            type="button"
            onClick={() => void compartir()}
            className={clsx(base, 'bg-primary text-text-inverse shadow-card hover:bg-primary-deep')}
          >
            <IconShare size={16} /> Compartir
          </button>
        )}
        <button
          type="button"
          onClick={() => void copiar()}
          aria-live="polite"
          className={clsx(
            base,
            puedeCompartir
              ? 'border border-border bg-bg-elevated text-text hover:bg-bg-secondary'
              : 'bg-primary text-text-inverse shadow-card hover:bg-primary-deep',
          )}
        >
          {copiado ? <IconCheck size={16} stroke={2.5} /> : <IconCopy size={16} />}
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p className="text-[12px] leading-snug text-text-secondary">{explicacion}</p>
      {aviso && <p className="text-[12px] font-semibold text-debt-ink">{aviso}</p>}
    </div>
  )
}
