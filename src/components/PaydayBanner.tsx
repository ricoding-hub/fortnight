import { useState } from 'react'
import { IconBell, IconTarget, IconX } from '@tabler/icons-react'
import { isPayday } from '@/lib/paydays'
import { useConfig } from '@/hooks/useConfig'
import { useBudgetPlan } from '@/hooks/useBudgetPlan'
import { Richeto } from '@/components/Richeto'
import type { PayFreq } from '@/types'

interface PaydayBannerProps {
  /** Fires when the user taps "Aplicar mi plan" — typically opens the add-movement modal. */
  onApply?: () => void
}

/** Parses a 'YYYY-MM-DD' string from Supabase to a local-noon Date. */
function parseDateString(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  const [, y, mo, d] = m
  return new Date(Number(y), Number(mo) - 1, Number(d), 12, 0, 0, 0)
}

/** Renders only when today matches a payday computed from the user's pay profile. */
export function PaydayBanner({ onApply }: PaydayBannerProps) {
  const { data: config } = useConfig()
  const { data: plan } = useBudgetPlan()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null
  const reference = parseDateString(config?.pay_reference)
  const freq = (config?.pay_freq ?? 'catorcenal') as PayFreq
  const pay = Number(config?.pay_amount ?? 0)
  if (!reference || pay <= 0) return null
  if (!isPayday(reference, freq)) return null

  const buckets = plan?.buckets ?? []

  return (
    <div className="px-4 pb-1.5 pt-1 animate-[slide-up_360ms_cubic-bezier(0.4,1.6,0.5,1)]">
      <div
        className="relative overflow-hidden rounded-lg p-3.5 text-white"
        style={{
          background: 'linear-gradient(135deg, #2BB673 0%, #1F8F58 100%)',
          boxShadow: '0 14px 32px rgba(43,182,115,0.32)',
        }}
      >
        <div className="absolute -right-5 -top-7 h-32 w-32 rounded-full bg-white/10" />
        <div className="absolute -left-5 -bottom-10 h-28 w-28 rounded-full bg-white/[0.06]" />

        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Cerrar"
          className="absolute right-2.5 top-2.5 z-10 grid h-[22px] w-[22px] place-items-center rounded-full bg-white/20 transition-colors hover:bg-white/30"
        >
          <IconX size={11} stroke={2.5} color="#fff" />
        </button>

        <div className="relative flex items-center gap-3">
          <Richeto size={52} shadowColor="rgba(255,255,255,0.25)" />
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center gap-1">
              <IconBell size={12} stroke={2.5} color="#fff" />
              <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] opacity-85">
                Hoy es tu día de pago
              </span>
            </div>
            <p className="font-display text-[22px] font-extrabold leading-none">
              +${pay.toLocaleString()}
            </p>
            <p className="mt-1 text-[11px] font-medium opacity-85">
              Aplica tu plan antes de gastarlo.
            </p>
          </div>
        </div>

        {buckets.length > 0 && (
          <div className="relative mt-3 flex gap-1.5">
            {buckets.map((b) => (
              <div
                key={b.id}
                className="flex-1 rounded-md border border-white/15 px-2 py-1.5 backdrop-blur-sm"
                style={{ background: 'rgba(255,255,255,0.16)' }}
              >
                <p className="text-[9px] font-extrabold uppercase tracking-[0.04em] opacity-85">
                  {b.name.split(' ')[0]}
                </p>
                <p className="font-mono text-xs font-bold">
                  ${Math.round((pay * b.pct) / 100).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onApply}
          className="relative mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-white px-3 py-2.5 text-[12.5px] font-extrabold text-asset-deep transition-transform active:scale-[0.98]"
        >
          <IconTarget size={14} stroke={2} />
          Aplicar mi plan
        </button>
      </div>
    </div>
  )
}
