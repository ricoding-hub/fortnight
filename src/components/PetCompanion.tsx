import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useConfig } from '@/hooks/useConfig'
import { Richeto } from '@/components/Richeto'

/**
 * Per-route contextual messages — verbatim from
 * design_handoff_fortnight_redesign/design-files/app.jsx (`messages` map).
 */
const ROUTE_MESSAGES: Record<string, string> = {
  '/':            '¡Hey! Si pagas Klar hoy te ahorras $340 en intereses 💸',
  '/plan':        'Probemos el 50/30/20 — te lo dejé pre-cargado, ajusta lo que quieras 🎯',
  '/cuentas':     'Plata está al 87%. Sugiero bajarla antes del corte 🧐',
  '/prestamos':   'Jeremy y Ale aún te deben. ¿Les recuerdo? 😏',
  '/movimientos': 'Cada peso contado es uno controlado.',
}

function messageFor(pathname: string): string {
  if (pathname.startsWith('/plan')) return ROUTE_MESSAGES['/plan']
  return ROUTE_MESSAGES[pathname] ?? '¿En qué te ayudo?'
}

/**
 * Floating Richeto companion — bottom-right of the viewport with a chat
 * bubble. Hidden on /perfil (the user is configuring Richeto there) and when
 * `pet_floating` is disabled in the profile.
 *
 * Auto-opens the bubble briefly when the route changes, then collapses; tap
 * toggles it back on.
 */
export function PetCompanion() {
  const location = useLocation()
  const { data: config } = useConfig()
  const [open, setOpen] = useState(false)

  // Auto-show the bubble briefly on every route change so the comment surfaces
  // without forcing the user to tap.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true)
    const t = window.setTimeout(() => setOpen(false), 4000)
    return () => window.clearTimeout(t)
  }, [location.pathname])

  if (location.pathname.startsWith('/perfil')) return null
  if (config && config.pet_floating === false) return null

  const message = messageFor(location.pathname)

  return (
    <div
      className="pointer-events-none fixed z-40 flex flex-col items-end gap-1.5 lg:bottom-6 lg:right-6"
      style={{
        bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))',
        right: '0.875rem',
      }}
    >
      {open && (
        <div className="pointer-events-auto max-w-[220px] rounded-2xl rounded-br-[4px] bg-bg-elevated px-3.5 py-2.5 text-[12.5px] font-semibold leading-snug text-text shadow-lift animate-[fn-pop_280ms_cubic-bezier(0.4,1.6,0.5,1)]">
          {message}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Richeto, tu asistente"
        aria-expanded={open}
        className="pointer-events-auto cursor-pointer border-none bg-transparent p-0 transition-transform active:scale-90"
      >
        <Richeto size={64} />
      </button>
    </div>
  )
}
