import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import {
  IconChevronLeft,
  IconChevronRight,
  IconCalendarEvent,
  IconInfoCircle,
  IconCash,
  IconCreditCard,
  IconTarget,
  IconRocket,
  IconLogout,
  IconDownload,
  IconShieldLock,
  IconInfoSquareRounded,
  IconBell,
  type Icon,
} from '@tabler/icons-react'

import { useAuth } from '@/hooks/useAuth'
import { useConfig } from '@/hooks/useConfig'
import { useAccounts } from '@/hooks/useAccounts'
import { useTransactions } from '@/hooks/useTransactions'
import { useLoans } from '@/hooks/useLoans'
import { useCategories } from '@/hooks/useCategories'
import { useToast } from '@/hooks/useToast'
import { Card } from '@/components/ui/Card'
import { Richeto } from '@/components/Richeto'
import { ConnectedBanksSection } from '@/components/syncfy/ConnectedBanksSection'
import { PAY_FREQS, computePaydays, fmtPayday } from '@/lib/paydays'
import type { PayFreq, UserConfig } from '@/types'

const APP_VERSION = __APP_VERSION__

interface ProfileForm {
  pay_freq: PayFreq
  pay_amount: number
  pay_reference: string
  notif_payday: boolean
  notif_due_card: boolean
  notif_mission: boolean
  notif_goal: boolean
  pet_floating: boolean
}

const DEFAULTS: ProfileForm = {
  pay_freq: 'catorcenal',
  pay_amount: 0,
  pay_reference: '',
  notif_payday: true,
  notif_due_card: true,
  notif_mission: false,
  notif_goal: true,
  pet_floating: true,
}

/** Initials for the avatar (first letter of name/email, uppercase). */
function initial(s: string | null | undefined): string {
  return (s?.trim()?.[0] ?? '?').toUpperCase()
}

export function Profile() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { data: config, update } = useConfig()
  const { data: accounts } = useAccounts()
  const { data: transactions } = useTransactions()
  const { data: loans } = useLoans()
  const { data: categories } = useCategories()
  const toast = useToast()

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split('@')[0] ??
    'Usuario'
  const handle = '@' + displayName.toLowerCase().replace(/[^a-z0-9_]/g, '')

  const { register, reset, getValues, setValue, watch } = useForm<ProfileForm>({
    defaultValues: DEFAULTS,
  })

  // Hydrate the form once config arrives — and again whenever the server's
  // updated_at changes (so realtime updates from another device propagate).
  // The realtime echo from our own write is harmless: reset() runs with
  // identical values and watch() filters out non-'change' events below.
  const hydratedRef = useRef<string | null>(null)
  // Last-saved snapshot — used to avoid re-saving identical values when the
  // watch subscription fires after a reset or when nothing actually changed.
  const lastSavedRef = useRef<string>('')
  // Throttle error toasts so a flapping connection doesn't spam the user.
  const lastErrorAtRef = useRef(0)

  useEffect(() => {
    if (!config) return
    if (hydratedRef.current === config.updated_at) return
    hydratedRef.current = config.updated_at
    const form = toForm(config)
    reset(form)
    lastSavedRef.current = JSON.stringify(form)
  }, [config, reset])

  // Debounced auto-save. Guards:
  //   • skip if the form hasn't hydrated yet (don't overwrite server with defaults)
  //   • skip if the patch matches the last-saved snapshot (idempotent)
  //   • dedupe error toasts to one per 5s window
  const saveTimerRef = useRef<number | null>(null)
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      if (hydratedRef.current === null) return
      const values = getValues()
      const snapshot = JSON.stringify(values)
      if (snapshot === lastSavedRef.current) return
      lastSavedRef.current = snapshot
      void update(values).catch(() => {
        // Roll back the snapshot so the next change retries the save.
        lastSavedRef.current = ''
        const now = Date.now()
        if (now - lastErrorAtRef.current > 5000) {
          lastErrorAtRef.current = now
          toast.error('No se pudo guardar', 'Reintenta en unos segundos')
        }
      })
    }, 1000)
  }, [getValues, update, toast])

  useEffect(() => () => {
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current)
  }, [])

  // Auto-save on user input. `type === 'change'` excludes programmatic resets.
  // React Compiler skips this hook because RHF's watch() returns a function that
  // can't be safely memoized — known and benign.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/incompatible-library
    const sub = watch((_values, { type }) => {
      if (type !== 'change') return
      scheduleSave()
    })
    return () => sub.unsubscribe()
  }, [watch, scheduleSave])

  // Live values for derived UI (monthly equivalent, upcoming paydays).
  const live = watch()
  const freq = (live.pay_freq ?? 'catorcenal') as PayFreq
  const amount = Number(live.pay_amount ?? 0)
  const refDate = live.pay_reference ?? ''

  const handleFreqChange = useCallback(
    (newFreq: PayFreq) => {
      setValue('pay_freq', newFreq, { shouldDirty: true })
      scheduleSave()
    },
    [setValue, scheduleSave],
  )

  const monthly = useMemo(
    () => Math.round(amount * PAY_FREQS[freq].cyclesPerMonth),
    [amount, freq],
  )

  const upcoming = useMemo(() => {
    if (!refDate) return []
    const parsed = parseDateInput(refDate)
    if (!parsed) return []
    return computePaydays(parsed, freq, 6)
  }, [refDate, freq])

  const today = useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0)
  }, [])

  const handleExport = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: APP_VERSION,
      user: user ? { id: user.id, email: user.email } : null,
      accounts,
      transactions,
      loans,
      categories,
      config,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `fortnight-export-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }, [user, accounts, transactions, loans, categories, config])

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
    } catch {
      toast.error('No se pudo cerrar sesión')
    }
  }, [signOut, toast])

  return (
    <div className="flex flex-col pb-6 animate-[fade-in_300ms_ease-out]">
      {/* Header */}
      <header className="flex items-center px-4 pb-2 pt-4 lg:pt-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-elevated text-text-secondary shadow-card transition-colors hover:bg-bg-secondary"
        >
          <IconChevronLeft size={18} />
        </button>
        <h1 className="mx-auto font-display text-lg font-bold tracking-tight text-text">
          Perfil
        </h1>
        <div className="w-10" />
      </header>

      {/* Profile card */}
      <div className="px-4 pt-2">
        <div
          className="relative overflow-hidden rounded-xl p-4 text-white shadow-card"
          style={{
            background: 'linear-gradient(135deg, #2A4BFF 0%, #9B7BFF 100%)',
          }}
        >
          <div className="absolute -right-6 -top-8 h-32 w-32 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-4">
            <div className="flex h-[60px] w-[60px] items-center justify-center rounded-full border-2 border-white/50 bg-white/25 font-display text-2xl font-extrabold">
              {initial(displayName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-xl font-extrabold">
                {displayName}
              </p>
              <p className="font-mono text-xs text-white/80">{handle}</p>
              <div className="mt-1.5 flex gap-1.5">
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-white">
                  NIVEL 1
                </span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-white">
                  0 XP
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tu pago */}
      <SectionHeader>Tu pago</SectionHeader>
      <div className="px-4">
        <Card className="flex flex-col gap-4">
          {/* Frequency grid */}
          <div>
            <Eyebrow>Frecuencia</Eyebrow>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.entries(PAY_FREQS) as [PayFreq, typeof PAY_FREQS[PayFreq]][]).map(
                ([key, info]) => {
                  const active = freq === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleFreqChange(key)}
                      className={
                        'flex flex-col items-start gap-0.5 rounded-md px-3 py-2.5 text-left transition-all duration-[--duration-fast] ' +
                        (active
                          ? 'bg-primary text-white shadow-[0_4px_10px_rgba(42,75,255,0.25)]'
                          : 'bg-bg-secondary text-text hover:bg-bg-elevated')
                      }
                    >
                      <span className="text-[13px] font-extrabold">{info.label}</span>
                      <span
                        className={
                          'font-mono text-[10px] font-semibold ' +
                          (active ? 'text-white/80' : 'text-text-tertiary')
                        }
                      >
                        {Math.round(info.cyclesPerYear)}/año
                      </span>
                    </button>
                  )
                },
              )}
            </div>
          </div>

          {/* Amount */}
          <div>
            <Eyebrow>Monto por {PAY_FREQS[freq].label.toLowerCase()}</Eyebrow>
            <div className="flex items-center gap-2 rounded-md bg-bg-secondary px-3.5 py-3">
              <span className="font-mono text-sm font-bold text-text-tertiary">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={100}
                {...register('pay_amount', { valueAsNumber: true })}
                className="min-w-0 flex-1 bg-transparent font-mono text-base font-semibold text-text outline-none placeholder:text-text-tertiary"
                placeholder="0"
              />
            </div>
            <p className="mt-2 font-mono text-[11px] text-text-tertiary">
              Equivale a{' '}
              <b className="text-asset-deep">${monthly.toLocaleString('en-US')}</b>/mes
            </p>
          </div>
        </Card>
      </div>

      {/* Días de pago */}
      <SectionHeader right={<span className="text-[11px] font-bold text-text-tertiary">auto</span>}>
        Días de pago
      </SectionHeader>
      <div className="px-4">
        <Card className="flex flex-col gap-3.5">
          <div>
            <Eyebrow>Última fecha de pago</Eyebrow>
            <div className="flex items-center gap-2.5 rounded-md bg-bg-secondary px-3.5 py-3">
              <IconCalendarEvent size={18} className="text-primary" />
              <input
                type="date"
                {...register('pay_reference')}
                className="min-w-0 flex-1 bg-transparent font-mono text-sm font-semibold text-text outline-none"
              />
            </div>
          </div>

          <div>
            <Eyebrow>Próximos pagos detectados</Eyebrow>
            {upcoming.length === 0 ? (
              <p className="text-xs text-text-tertiary">
                Elige tu última fecha de pago para detectar los próximos.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {upcoming.map((d, i) => {
                  const isToday = sameDay(d, today)
                  return (
                    <span
                      key={i}
                      className={
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ' +
                        (isToday
                          ? 'bg-primary text-white shadow-[0_4px_10px_rgba(42,75,255,0.3)]'
                          : i === 0
                            ? 'bg-primary-soft text-primary'
                            : 'bg-bg-secondary text-text-secondary')
                      }
                    >
                      {isToday && <IconBell size={11} stroke={2.5} />}
                      <span className="font-mono">{fmtPayday(d)}</span>
                      {isToday && (
                        <span className="text-[10px] font-semibold opacity-85">· hoy</span>
                      )}
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-md bg-primary-tint p-2.5">
            <IconInfoCircle size={14} className="mt-0.5 shrink-0 text-primary" />
            <p className="text-[11.5px] font-medium leading-snug text-text-secondary">
              Te aviso cada día de pago para recordarte aplicar tu plan y guardar tu ahorro.
            </p>
          </div>
        </Card>
      </div>

      {/* Notificaciones */}
      <SectionHeader>Notificaciones</SectionHeader>
      <div className="px-4">
        <Card className="overflow-hidden p-0">
          <ToggleRow
            icon={IconCash}
            color="asset"
            label="Día de pago"
            description="Te aviso para que registres tu nómina"
            {...register('notif_payday')}
          />
          <ToggleRow
            icon={IconCreditCard}
            color="debt"
            label="Pago próximo"
            description="Antes de que se acumulen intereses"
            {...register('notif_due_card')}
          />
          <ToggleRow
            icon={IconRocket}
            color="lavender"
            label="Avance de meta"
            description="Cuando llegues a 25%, 50%, 75%"
            {...register('notif_goal')}
          />
          <ToggleRow
            icon={IconTarget}
            color="primary"
            label="Misión diaria"
            description="Recordatorio para mantener tu racha"
            last
            {...register('notif_mission')}
          />
        </Card>
      </div>

      {/* Richeto */}
      <SectionHeader>Richeto</SectionHeader>
      <div className="px-4">
        <Card className="flex items-center gap-3">
          <Richeto size={48} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-text">Compañero flotante</p>
            <p className="text-[11px] text-text-tertiary">
              Richeto te acompaña en cada pantalla
            </p>
          </div>
          <input type="checkbox" className="sr-only" {...register('pet_floating')} id="pet_floating" />
          <ToggleVisual checked={!!live.pet_floating} htmlFor="pet_floating" />
        </Card>
      </div>

      {/* Cuentas conectadas */}
      <SectionHeader>Cuentas conectadas</SectionHeader>
      <ConnectedBanksSection />

      {/* Cuenta */}
      <SectionHeader>Cuenta</SectionHeader>
      <div className="flex flex-col gap-2 px-4">
        <ActionRow icon={IconDownload} label="Exportar mis datos (JSON)" onClick={handleExport} />
        <ActionRow
          icon={IconShieldLock}
          label="Seguridad y privacidad"
          onClick={() => toast.info('Próximamente', 'Esta sección llega pronto.')}
        />
        <ActionRow
          icon={IconInfoSquareRounded}
          label={`Acerca de Fortnight v${APP_VERSION}`}
          onClick={() => navigate('/acerca-de')}
        />
        <ActionRow
          icon={IconLogout}
          label="Cerrar sesión"
          tone="debt"
          onClick={() => void handleSignOut()}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function toForm(c: UserConfig): ProfileForm {
  return {
    pay_freq: c.pay_freq ?? 'catorcenal',
    pay_amount: c.pay_amount ?? 0,
    pay_reference: c.pay_reference ?? '',
    notif_payday: c.notif_payday ?? true,
    notif_due_card: c.notif_due_card ?? true,
    notif_mission: c.notif_mission ?? false,
    notif_goal: c.notif_goal ?? true,
    pet_floating: c.pet_floating ?? true,
  }
}

/** Parse a YYYY-MM-DD string from an `<input type="date">` to a local-noon Date. */
function parseDateInput(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const [, y, mo, d] = m
  return new Date(Number(y), Number(mo) - 1, Number(d), 12, 0, 0, 0)
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/* ------------------------------------------------------------------ */
/* Small presentational primitives — local to Profile                  */
/* ------------------------------------------------------------------ */

function SectionHeader({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pb-2 pt-4">
      <h2 className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-text-tertiary">
        {children}
      </h2>
      {right}
    </div>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.06em] text-text-tertiary">
      {children}
    </p>
  )
}

const TOGGLE_COLORS: Record<string, string> = {
  asset: 'bg-asset-soft text-asset-deep',
  debt: 'bg-debt-soft text-debt-deep',
  lavender: 'bg-lavender-soft text-lavender-deep',
  primary: 'bg-primary-soft text-primary-deep',
}

interface ToggleRowProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  icon: Icon
  color: keyof typeof TOGGLE_COLORS
  label: string
  description: string
  last?: boolean
  ref?: React.Ref<HTMLInputElement>
}

function ToggleRow({
  icon: Icon,
  color,
  label,
  description,
  last,
  ref,
  ...inputProps
}: ToggleRowProps) {
  const id = `toggle-${inputProps.name}`
  return (
    <label
      htmlFor={id}
      className={
        'flex cursor-pointer items-center gap-3 px-3.5 py-3.5 ' +
        (last ? '' : 'border-b border-bg-secondary')
      }
    >
      <span
        className={
          'flex h-9 w-9 items-center justify-center rounded-md ' + TOGGLE_COLORS[color]
        }
      >
        <Icon size={16} stroke={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-text">{label}</p>
        <p className="text-[11px] text-text-tertiary">{description}</p>
      </div>
      <input ref={ref} id={id} type="checkbox" className="peer sr-only" {...inputProps} />
      <ToggleVisualPeer />
    </label>
  )
}

/** Toggle visual driven by the sibling `peer` checkbox. */
function ToggleVisualPeer() {
  return (
    <span className="relative inline-block h-[26px] w-11 shrink-0 rounded-full bg-bg-secondary transition-colors peer-checked:bg-asset">
      <span className="absolute top-[2px] left-[2px] block h-[22px] w-[22px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-all peer-checked:left-[20px]" />
    </span>
  )
}

/** Toggle visual paired with an external `htmlFor` (single-card row). */
function ToggleVisual({ checked, htmlFor }: { checked: boolean; htmlFor: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className={
        'relative inline-block h-[26px] w-11 shrink-0 cursor-pointer rounded-full transition-colors ' +
        (checked ? 'bg-asset' : 'bg-bg-secondary')
      }
    >
      <span
        className={
          'absolute top-[2px] block h-[22px] w-[22px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-all ' +
          (checked ? 'left-[20px]' : 'left-[2px]')
        }
      />
    </label>
  )
}

interface ActionRowProps {
  icon: Icon
  label: string
  onClick: () => void
  tone?: 'default' | 'debt'
}

function ActionRow({ icon: Icon, label, onClick, tone = 'default' }: ActionRowProps) {
  const tonal = tone === 'debt' ? 'text-debt-deep' : 'text-text'
  const iconBg = tone === 'debt' ? 'bg-debt-soft text-debt-deep' : 'bg-bg-secondary text-text-secondary'
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-md bg-bg-elevated px-3.5 py-3 text-left shadow-card transition-colors hover:bg-bg-tinted"
    >
      <span
        className={
          'flex h-[30px] w-[30px] items-center justify-center rounded-md ' + iconBg
        }
      >
        <Icon size={16} stroke={2} />
      </span>
      <span className={'flex-1 text-[13px] font-bold ' + tonal}>{label}</span>
      <IconChevronRight size={14} className="text-text-tertiary" />
    </button>
  )
}
