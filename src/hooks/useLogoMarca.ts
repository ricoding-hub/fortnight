import { useState } from 'react'
import { logoUrl } from '@/lib/logos'

/**
 * Logos de marca sin parpadeo.
 *
 * Antes se pedía el favicon y, si fallaba, se cambiaba a las iniciales: se veía
 * un cuadro blanco (a veces el globo genérico de Google) y luego otra cosa,
 * cada vez que la lista se volvía a montar. Ahora:
 *   · la imagen no se ve hasta que carga (sin destello);
 *   · un icono de menos de 32 px es el genérico de Google: cuenta como «sin logo»;
 *   · los dominios sin logo se recuerdan (en memoria y en el navegador), así
 *     que en las siguientes visitas salen las iniciales desde el inicio.
 */
const CLAVE = 'fortnight:logos-sin-marca'
let sinLogo: Set<string> | null = null

function fallidos(): Set<string> {
  if (sinLogo) return sinLogo
  try {
    sinLogo = new Set(JSON.parse(window.localStorage.getItem(CLAVE) ?? '[]') as string[])
  } catch {
    sinLogo = new Set()
  }
  return sinLogo
}

function marcarSinLogo(dominio: string) {
  const s = fallidos()
  if (s.has(dominio)) return
  s.add(dominio)
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify([...s].slice(-300)))
  } catch {
    // sin almacenamiento, sólo en esta sesión
  }
}

type Estado = 'cargando' | 'listo' | 'falla'

export interface LogoMarca {
  /** Hay que intentar mostrar el logo (no se sabe que falle). */
  mostrar: boolean
  /** Ya cargó: hasta entonces la imagen va invisible. */
  cargado: boolean
  img: {
    src: string
    onLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void
    onError: () => void
  }
}

export function useLogoMarca(dominio: string | null | undefined): LogoMarca {
  const inicial = (d: string | null | undefined): Estado => (d && !fallidos().has(d) ? 'cargando' : 'falla')
  // El estado va atado al dominio: si cambia (editaste la cuenta), se empieza
  // de nuevo en vez de heredar «falla» o «listo» del logo anterior.
  const [guardado, setGuardado] = useState<{ d: string | null | undefined; e: Estado }>(() => ({
    d: dominio,
    e: inicial(dominio),
  }))
  const estado = guardado.d === dominio ? guardado.e : inicial(dominio)
  const fallar = () => {
    if (dominio) marcarSinLogo(dominio)
    setGuardado({ d: dominio, e: 'falla' })
  }
  return {
    mostrar: !!dominio && estado !== 'falla',
    cargado: estado === 'listo',
    img: {
      src: dominio ? logoUrl(dominio) : '',
      // El favicon genérico de Google mide 16 px: eso es «sin logo».
      onLoad: (e) => {
        const w = e.currentTarget.naturalWidth
        if (w > 0 && w < 32) fallar()
        else setGuardado({ d: dominio, e: 'listo' })
      },
      onError: fallar,
    },
  }
}
