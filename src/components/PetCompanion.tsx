import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { IconPlayerPlay } from '@tabler/icons-react'
import { useConfig } from '@/hooks/useConfig'
import { useBudgetPlan } from '@/hooks/useBudgetPlan'
import { useGoals } from '@/hooks/useGoals'
import { Richeto } from '@/components/Richeto'
import { richetoAdvice, type AdviceTip } from '@/lib/advice'
import { PAY_FREQS, type PayFreq } from '@/lib/paydays'
import { useUiStore } from '@/store/uiStore'
import type { BucketWithSpend } from '@/lib/plan'

/**
 * Static per-route fallback messages — used when no smart advice tips apply
 * (e.g. user without budget data yet).
 */
const ROUTE_MESSAGES: Record<string, string> = {
  '/':                     '¿En qué te ayudo hoy?',
  '/plan':                 'Ajusta los porcentajes a tu vida — el 50/30/20 es solo el punto de partida.',
  '/cuentas':              'Mantén tus cuentas al día; un par de segundos por aquí evita sorpresas.',
  '/cuentas/movimientos':  'Cada peso contado es uno controlado.',
}

function fallbackMessage(pathname: string): string {
  if (pathname.startsWith('/cuentas/movimientos')) return ROUTE_MESSAGES['/cuentas/movimientos']
  if (pathname.startsWith('/plan')) return ROUTE_MESSAGES['/plan']
  if (pathname.startsWith('/cuentas')) return ROUTE_MESSAGES['/cuentas']
  return ROUTE_MESSAGES[pathname] ?? '¿En qué te ayudo?'
}

/** Spent=0 stub until a real rollup exists (mirrors the helper from Resumen). */
function withZeroSpend(
  buckets: ReturnType<typeof useBudgetPlan>['data'],
): BucketWithSpend[] {
  if (!buckets) return []
  return buckets.buckets.map((b) => ({
    ...b,
    items: b.items.map((it) => ({ ...it, spent: 0 })),
  }))
}

/**
 * Floating Richeto companion — bottom-right of the viewport with a chat
 * bubble. Hidden on /perfil (the user is configuring Richeto there) and when
 * `pet_floating` is disabled in the profile.
 *
 * Bubble content:
 *   • On `/` (Home): smart advice tips from `richetoAdvice()` with carousel
 *     (tap pet to cycle through tips).
 *   • Other routes: static route hint.
 *
 * Auto-opens the bubble briefly when the route changes, then collapses; tap
 * toggles it back on (or cycles to next tip on Home).
 */
export function PetCompanion() {
  const location = useLocation()
  const { data: config } = useConfig()
  const { data: planData } = useBudgetPlan()
  const { data: goals } = useGoals()
  const [open, setOpen] = useState(false)
  const [tipIdx, setTipIdx] = useState(0)
  const openTour = useUiStore((s) => s.openTour)

  // Smart tips — only computed on home where they make sense.
  const tips = useMemo<AdviceTip[]>(() => {
    if (location.pathname !== '/') return []
    const freq: PayFreq = (config?.pay_freq ?? 'catorcenal') as PayFreq
    const monthlyIncome = Math.round(
      (config?.pay_amount ?? 0) * PAY_FREQS[freq].cyclesPerMonth,
    )
    return richetoAdvice(withZeroSpend(planData), monthlyIncome, goals)
  }, [location.pathname, config, planData, goals])

  // Auto-show on route change; reset carousel position.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true)
    setTipIdx(0)
    const t = window.setTimeout(() => setOpen(false), 4500)
    return () => window.clearTimeout(t)
  }, [location.pathname])

  if (location.pathname.startsWith('/perfil')) return null
  if (config && config.pet_floating === false) return null

  const tip = tips.length > 0 ? tips[tipIdx % tips.length] : null

  function handleTap() {
    // If closed → open. If open and there are multiple tips → cycle.
    if (!open) {
      setOpen(true)
      return
    }
    if (tip && tips.length > 1) {
      setTipIdx((i) => i + 1)
      return
    }
    setOpen(false)
  }

  return (
    <div
      id="tour-pet"
      className="pointer-events-none fixed z-40 flex flex-col items-end gap-1.5 lg:bottom-6 lg:right-6"
      style={{
        bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))',
        right: '0.875rem',
      }}
    >
      {open && (
        <div
          className="pointer-events-auto relative max-w-[240px] overflow-hidden rounded-2xl rounded-br-[4px] bg-bg-elevated px-3.5 py-2.5 text-text shadow-lift animate-[fn-pop_280ms_cubic-bezier(0.4,1.6,0.5,1)]"
        >
          {tip ? (
            <>
              <div
                className="absolute bottom-0 left-0 top-0 w-1"
                style={{ background: tip.color }}
              />
              <div className="pl-1.5">
                <p
                  className="mb-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.08em]"
                  style={{ color: tip.color }}
                >
                  Richeto sugiere
                  {tips.length > 1 && (
                    <span className="ml-1.5 font-mono text-text-tertiary">
                      {(tipIdx % tips.length) + 1}/{tips.length}
                    </span>
                  )}
                </p>
                <p className="text-[12.5px] font-extrabold leading-tight">
                  {tip.title}
                </p>
                <p className="mt-1 text-[11.5px] font-medium leading-snug text-text-secondary">
                  {tip.body}
                </p>
                {tips.length > 1 && (
                  <p className="mt-1.5 text-[10px] font-semibold text-text-tertiary">
                    Toca a Richeto para el siguiente
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-[12.5px] font-semibold leading-snug">
              {fallbackMessage(location.pathname)}
            </p>
          )}
          <button
            type="button"
            onClick={() => { openTour(); setOpen(false) }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary/10 py-2 text-[11.5px] font-bold text-primary transition-colors hover:bg-primary/20"
          >
            <IconPlayerPlay size={12} stroke={2.5} />
            Ver tour guiado
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={handleTap}
        aria-label="Richeto, tu asistente"
        aria-expanded={open}
        className="pointer-events-auto cursor-pointer border-none bg-transparent p-0 transition-transform active:scale-90"
      >
        <Richeto size={64} />
      </button>
    </div>
  )
}
