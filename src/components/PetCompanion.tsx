import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { IconPlayerPlay } from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import { useConfig } from '@/hooks/useConfig'
import { useBudgetPlan } from '@/hooks/useBudgetPlan'
import { useGoals } from '@/hooks/useGoals'
import { Richeto } from '@/components/Richeto'
import { richetoAdvice, type AdviceTip } from '@/lib/advice'
import { PAY_FREQS, type PayFreq } from '@/lib/paydays'
import { useUiStore } from '@/store/uiStore'
import { moduleKey, moduleMessage, markSeen, readSeen } from '@/lib/richetoModules'
import type { BucketWithSpend } from '@/lib/plan'

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
 * Speaks up on its OWN the first time you enter each module, then stays quiet:
 * after that the bubble only opens when you tap Richeto. Popping open on every
 * route change turned a helpful hint into noise.
 */
export function PetCompanion() {
  const location = useLocation()
  const { data: config } = useConfig()
  const { data: planData } = useBudgetPlan()
  const { data: goals } = useGoals()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  // The carousel position belongs to a module: derive the reset instead of
  // writing it from an effect on every navigation.
  const [tipState, setTipState] = useState<{ mod: string; idx: number }>({ mod: '', idx: 0 })
  const openTour = useUiStore((s) => s.openTour)
  const mod = moduleKey(location.pathname)
  const tipIdx = tipState.mod === mod ? tipState.idx : 0

  // Smart tips — only computed on home where they make sense.
  const tips = useMemo<AdviceTip[]>(() => {
    if (location.pathname !== '/') return []
    const freq: PayFreq = (config?.pay_freq ?? 'catorcenal') as PayFreq
    const monthlyIncome = Math.round(
      (config?.pay_amount ?? 0) * PAY_FREQS[freq].cyclesPerMonth,
    )
    return richetoAdvice(withZeroSpend(planData), monthlyIncome, goals)
  }, [location.pathname, config, planData, goals])

  // Introduce the module the first time it's visited; otherwise start closed so
  // navigating never interrupts. Tapping Richeto is what opens it from then on.
  useEffect(() => {
    const firstVisit = !readSeen(user?.id).has(mod)
    if (firstVisit) markSeen(user?.id, mod)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(firstVisit)
    if (!firstVisit) return
    const t = window.setTimeout(() => setOpen(false), 5500)
    return () => window.clearTimeout(t)
  }, [mod, user?.id])

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
      setTipState({ mod, idx: tipIdx + 1 })
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
              <div>
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
              {moduleMessage(location.pathname)}
            </p>
          )}
          <button
            type="button"
            onClick={() => { openTour(); setOpen(false) }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary/10 py-2 text-[11.5px] font-bold text-primary transition-colors hover:bg-primary/20"
          >
            <IconPlayerPlay size={12} stroke={2.5} />
            {location.pathname.startsWith('/cuentas')
              ? '¿Cómo funciona esto?'
              : location.pathname.startsWith('/plan')
              ? '¿Qué significa esto?'
              : 'Ver tour guiado'}
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
