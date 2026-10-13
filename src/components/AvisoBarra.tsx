import { useState } from 'react'
import { IconX } from '@tabler/icons-react'
import { modoBarra } from '@/lib/barraEstado'
import { isIOS } from '@/lib/platform'

const CLAVE = 'fortnight:aviso-barra-translucida'

function visto(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) === '1'
  } catch {
    return false
  }
}

/**
 * Una sola vez: si la app quedó instalada con la barra translúcida, la franja
 * borrosa de arriba es de iOS y sólo se quita reinstalando. Sin esto la única
 * pista era que «otras apps no la tienen».
 */
export function AvisoBarra() {
  const [mostrar, setMostrar] = useState(() => isIOS() && modoBarra() === 'translucida' && !visto())
  if (!mostrar) return null

  function cerrar() {
    setMostrar(false)
    try {
      window.localStorage.setItem(CLAVE, '1')
    } catch {
      // sin almacenamiento volverá a salir; no pasa nada
    }
  }

  return (
    <div className="mx-4 mt-2 flex items-start gap-2.5 rounded-2xl bg-lavender-soft/60 px-3.5 py-3">
      <div className="min-w-0 flex-1 text-[12.5px] leading-snug text-text">
        <p className="font-bold">¿Ves una franja borrosa arriba?</p>
        <p className="mt-0.5 text-text-secondary">
          Es de iOS: tu app quedó instalada con un ajuste viejo de la barra de arriba. Para quitarla, bórrala de tu
          pantalla de inicio, abre fortnight en Safari, espera a que cargue y vuelve a agregarla con Compartir →
          Agregar a inicio.
        </p>
      </div>
      <button
        type="button"
        onClick={cerrar}
        aria-label="Entendido"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-secondary"
      >
        <IconX size={15} />
      </button>
    </div>
  )
}
