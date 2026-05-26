import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import {
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
  IconCamera,
  IconFlame,
  IconMail,
  IconLock,
  type Icon,
} from '@tabler/icons-react'

import { useAuth } from '@/hooks/useAuth'
import { useConfig } from '@/hooks/useConfig'
import { useGamification } from '@/hooks/useGamification'
import { useAccounts } from '@/hooks/useAccounts'
import { useTransactions } from '@/hooks/useTransactions'
import { useLoans } from '@/hooks/useLoans'
import { useCategories } from '@/hooks/useCategories'
import { useToast } from '@/hooks/useToast'
import { Card } from '@/components/ui/Card'
import { Richeto } from '@/components/Richeto'
import { Confetti } from '@/components/Confetti'
import { supabase } from '@/lib/supabase'
import { PAY_FREQS, computePaydays, fmtPayday } from '@/lib/paydays'
import { calculateScore } from '@/lib/score'
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
  notif_email: boolean
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
  notif_email: true,
  pet_floating: true,
}

/** First letter of name/email, uppercase. */
function initial(s: string | null | undefined): string {
  return (s?.trim()?.[0] ?? '?').toUpperCase()
}

/** Level XP thresholds (index = level - 1). */
const LEVEL_XP = [0, 500, 1500, 3500, 7000] as const
function nextLevelFor(lv: number) { return LEVEL_XP[lv] ?? (LEVEL_XP[LEVEL_XP.length - 1] * 2) }

/** Resize an image to max side via canvas, return a Blob. */
async function resizeImage(file: File, maxPx = 400): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), 'image/webp', 0.85)
    }
    img.onerror = reject
    img.src = url
  })
}

/* ─────────────────────────────────────── Achievements definition ── */

interface Achievement {
  id: string
  title: string
  description: string
  icon: Icon
  color: string
  unlocked: boolean
}

function useAchievements(xp: number, streakDays: number, txCount: number, score: number): Achievement[] {
  return useMemo(() => [
    {
      id: 'first-tx',
      title: 'Primera transacción',
      description: 'Registraste tu primer movimiento.',
      icon: IconCash,
      color: '#2BB673',
      unlocked: txCount >= 1,
    },
    {
      id: 'streak-7',
      title: '7 días de racha',
      description: 'Mantuviste actividad por 7 días seguidos.',
      icon: IconFlame,
      color: '#FF5A5F',
      unlocked: streakDays >= 7,
    },
    {
      id: 'score-5',
      title: 'Score 5+',
      description: 'Alcanzaste un score financiero de 5 o más.',
      icon: IconTarget,
      color: '#2A4BFF',
      unlocked: score >= 5,
    },
    {
      id: 'xp-500',
      title: 'Nivel 2',
      description: 'Ganaste 500 XP con tu consistencia.',
      icon: IconRocket,
      color: '#9B7BFF',
      unlocked: xp >= 500,
    },
  ], [xp, streakDays, txCount, score])
}

/* ═══════════════════════════════════════════ Main component ══════ */

export function Profile() {
  const { user, signOut } = useAuth()
  const { data: config, update } = useConfig()
  const { data: gami } = useGamification()
  const { data: accounts } = useAccounts()
  const { data: transactions } = useTransactions()
  const { data: loans } = useLoans()
  const { data: categories } = useCategories()
  const toast = useToast()

  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [confettiAchievement, setConfettiAchievement] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split('@')[0] ??
    'Usuario'
  const handle = '@' + displayName.toLowerCase().replace(/[^a-z0-9_]/g, '')
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined

  // Achievement signals
  const txCount = transactions.length
  const score = useMemo(() => calculateScore(accounts), [accounts])
  const achievements = useAchievements(gami.xp, gami.streak_days, txCount, score)

  // Level info
  const lv = gami.level
  const currentLevelXP = LEVEL_XP[lv - 1] ?? 0
  const nextXP = nextLevelFor(lv)
  const progressPct = nextXP > currentLevelXP
    ? Math.round(((gami.xp - currentLevelXP) / (nextXP - currentLevelXP)) * 100)
    : 100

  /* ───────── Form auto-save (unchanged logic) ───────── */

  const { register, reset, getValues, setValue, watch } = useForm<ProfileForm>({
    defaultValues: DEFAULTS,
  })

  const hydratedRef = useRef<string | null>(null)
  const lastSavedRef = useRef<string>('')
  const lastErrorAtRef = useRef(0)

  useEffect(() => {
    if (!config) return
    if (hydratedRef.current === config.updated_at) return
    hydratedRef.current = config.updated_at
    const form = toForm(config)
    reset(form)
    lastSavedRef.current = JSON.stringify(form)
  }, [config, reset])

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

  // eslint-disable-next-line react-hooks/incompatible-library
  useEffect(() => {
    const sub = watch((_values, { type }) => {
      if (type !== 'change') return
      scheduleSave()
    })
    return () => sub.unsubscribe()
  }, [watch, scheduleSave])

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

  /* ───────── Avatar upload ───────── */

  const handleAvatarChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploadingAvatar(true)
    try {
      // Ensure bucket exists (idempotent)
      await supabase.storage.createBucket('avatars', { public: true }).catch(() => {/* already exists */})

      const blob = await resizeImage(file, 400)
      const ext = 'webp'
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/webp' })
      if (uploadErr) throw uploadErr

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      const { error: metaErr } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl },
      })
      if (metaErr) throw metaErr

      toast.success('Foto actualizada', 'Tu foto de perfil se guardó correctamente.')
    } catch {
      toast.error('Error al subir foto', 'Intenta con una imagen más pequeña.')
    } finally {
      setUploadingAvatar(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [user, toast])

  /* ───────── Export + sign out ───────── */

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
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
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
    try { await signOut() } catch { toast.error('No se pudo cerrar sesión') }
  }, [signOut, toast])

  /* ───────── Render ───────── */

  return (
    <div className="flex flex-col pb-8 animate-[fade-in_300ms_ease-out]">
      {/* ── Header (tab primario — sin botón atrás) ── */}
      <header className="px-4 pb-2 pt-4 lg:pt-2">
        <h1 className="font-display text-[28px] font-bold tracking-tight text-text">Perfil</h1>
        <p className="mt-0.5 text-[12.5px] font-medium text-text-secondary">
          Tu cuenta y preferencias
        </p>
      </header>

      {/* ── Hero card ── */}
      <div className="px-4 pt-1">
        <div
          className="relative overflow-hidden rounded-xl p-4 text-white shadow-card"
          style={{ background: 'linear-gradient(135deg, #2A4BFF 0%, #9B7BFF 100%)' }}
        >
          <div className="absolute -right-6 -top-8 h-32 w-32 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-4">
            {/* Avatar with photo upload */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingAvatar}
                className="relative block h-[64px] w-[64px] overflow-hidden rounded-full border-2 border-white/50 transition-all active:scale-95"
                aria-label="Cambiar foto de perfil"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-white/25 font-display text-2xl font-extrabold">
                    {initial(displayName)}
                  </span>
                )}
                {/* Camera overlay */}
                <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                  <IconCamera size={20} stroke={2} color="#fff" />
                </span>
                {uploadingAvatar && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  </span>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => void handleAvatarChange(e)}
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-xl font-extrabold">{displayName}</p>
              <p className="font-mono text-xs text-white/80">{handle}</p>
              <div className="mt-1.5 flex gap-1.5">
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-extrabold tracking-wide">
                  NIVEL {lv}
                </span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-extrabold tracking-wide">
                  {gami.xp} XP
                </span>
                {gami.streak_days > 0 && (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-extrabold tracking-wide">
                    🔥 {gami.streak_days}d
                  </span>
                )}
              </div>
              {/* XP progress bar */}
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-700"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="font-mono text-[9px] font-bold text-white/70 shrink-0">
                  {gami.xp}/{nextXP}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tu pago ── */}
      <SectionHeader>Tu pago</SectionHeader>
      <div className="px-4">
        <Card className="flex flex-col gap-4">
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
                        'flex flex-col items-start gap-0.5 rounded-md px-3 py-2.5 text-left transition-all active:scale-[0.97] ' +
                        (active
                          ? 'bg-primary text-white shadow-[0_4px_10px_rgba(42,75,255,0.25)]'
                          : 'bg-bg-secondary text-text hover:bg-bg-elevated')
                      }
                    >
                      <span className="text-[13px] font-extrabold">{info.label}</span>
                      <span className={'font-mono text-[10px] font-semibold ' + (active ? 'text-white/80' : 'text-text-tertiary')}>
                        {Math.round(info.cyclesPerYear)}/año
                      </span>
                    </button>
                  )
                },
              )}
            </div>
          </div>

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

      {/* ── Días de pago ── */}
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
                      {isToday && <span className="text-[10px] font-semibold opacity-85">· hoy</span>}
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

      {/* ── Notificaciones ── */}
      <SectionHeader>Notificaciones</SectionHeader>
      <div className="px-4">
        <Card className="overflow-hidden p-0">
          <ToggleRow
            icon={IconCash}
            color="asset"
            label="Día de pago"
            description="Te aviso para que registres tu nómina"
            checked={!!live.notif_payday}
            {...register('notif_payday')}
          />
          <ToggleRow
            icon={IconCreditCard}
            color="debt"
            label="Pago próximo"
            description="Antes de que se acumulen intereses"
            checked={!!live.notif_due_card}
            {...register('notif_due_card')}
          />
          <ToggleRow
            icon={IconRocket}
            color="lavender"
            label="Avance de meta"
            description="Cuando llegues a 25%, 50%, 75%"
            checked={!!live.notif_goal}
            {...register('notif_goal')}
          />
          <ToggleRow
            icon={IconTarget}
            color="primary"
            label="Misión diaria"
            description="Recordatorio para mantener tu racha"
            checked={!!live.notif_mission}
            {...register('notif_mission')}
          />
          <ToggleRow
            icon={IconMail}
            color="asset"
            label="Correo electrónico"
            description="Richeto te avisa por email un día antes"
            last
            checked={!!live.notif_email}
            {...register('notif_email')}
          />
        </Card>
      </div>

      {/* ── Richeto ── */}
      <SectionHeader>Richeto</SectionHeader>
      <div className="px-4">
        <Card className="flex items-center gap-3">
          <Richeto size={48} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-text">Compañero flotante</p>
            <p className="text-[11px] text-text-tertiary">Richeto te acompaña en cada pantalla</p>
          </div>
          <input type="checkbox" className="sr-only" {...register('pet_floating')} id="pet_floating" />
          <ToggleVisual checked={!!live.pet_floating} htmlFor="pet_floating" />
        </Card>
      </div>

      {/* ── Logros ── */}
      <SectionHeader>Logros</SectionHeader>
      <div className="px-4">
        <div className="grid grid-cols-2 gap-2.5">
          {achievements.map((ach) => {
            const Icon = ach.icon
            const showConfetti = confettiAchievement === ach.id
            return (
              <button
                key={ach.id}
                type="button"
                onClick={() => {
                  if (!ach.unlocked) return
                  setConfettiAchievement(ach.id)
                  window.setTimeout(() => setConfettiAchievement(null), 2200)
                }}
                className={
                  'relative overflow-hidden rounded-xl p-3.5 text-left transition-all ' +
                  (ach.unlocked
                    ? 'bg-bg-elevated shadow-card active:scale-[0.96]'
                    : 'bg-bg-secondary opacity-55 cursor-default')
                }
              >
                {showConfetti && (
                  <div className="absolute inset-0 pointer-events-none">
                    <Confetti count={20} />
                  </div>
                )}
                <span
                  className="mb-2 grid h-9 w-9 place-items-center rounded-lg"
                  style={{ background: ach.unlocked ? ach.color + '22' : 'transparent' }}
                >
                  {ach.unlocked ? (
                    <Icon size={18} stroke={2} color={ach.color} />
                  ) : (
                    <IconLock size={16} stroke={2} className="text-text-tertiary" />
                  )}
                </span>
                <p className="text-[12px] font-extrabold text-text leading-tight">{ach.title}</p>
                <p className="mt-0.5 text-[10.5px] text-text-tertiary leading-snug">{ach.description}</p>
                {ach.unlocked && (
                  <span
                    className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-extrabold text-white"
                    style={{ background: ach.color }}
                  >
                    Desbloqueado
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Cuenta ── */}
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
          onClick={() => {
            window.location.href = '/acerca-de'
          }}
        />
        <ActionRow
          icon={IconLogout}
          label="Cerrar sesión"
          tone="debt"
          onClick={() => void handleSignOut()}
        />
      </div>

      <div className="h-8" />
    </div>
  )
}

/* ─────────────────── Helpers ─────────────── */

function toForm(c: UserConfig): ProfileForm {
  return {
    pay_freq: c.pay_freq ?? 'catorcenal',
    pay_amount: c.pay_amount ?? 0,
    pay_reference: c.pay_reference ?? '',
    notif_payday: c.notif_payday ?? true,
    notif_due_card: c.notif_due_card ?? true,
    notif_mission: c.notif_mission ?? false,
    notif_goal: c.notif_goal ?? true,
    notif_email: c.notif_email ?? true,
    pet_floating: c.pet_floating ?? true,
  }
}

function parseDateInput(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const [, y, mo, d] = m
  return new Date(Number(y), Number(mo) - 1, Number(d), 12, 0, 0, 0)
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

/* ─────────────────── Presentational primitives ─────────────── */

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
  checked?: boolean
  ref?: React.Ref<HTMLInputElement>
}

function ToggleRow({ icon: IconEl, color, label, description, last, checked, ref, ...inputProps }: ToggleRowProps) {
  const id = `toggle-${inputProps.name}`
  return (
    <label
      htmlFor={id}
      className={
        'flex cursor-pointer items-center gap-3 px-3.5 py-3.5 transition-colors hover:bg-bg-secondary active:bg-bg-secondary ' +
        (last ? '' : 'border-b border-bg-secondary')
      }
    >
      <span className={'flex h-9 w-9 items-center justify-center rounded-md ' + TOGGLE_COLORS[color]}>
        <IconEl size={16} stroke={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-text">{label}</p>
        <p className="text-[11px] text-text-tertiary">{description}</p>
      </div>
      <input ref={ref} id={id} type="checkbox" className="peer sr-only" {...inputProps} />
      {checked !== undefined
        ? <ToggleVisual checked={checked} htmlFor={id} />
        : <ToggleVisualPeer />}
    </label>
  )
}

function ToggleVisualPeer() {
  return (
    <span className="relative inline-block h-[26px] w-11 shrink-0 rounded-full bg-bg-secondary transition-colors peer-checked:bg-asset">
      <span className="absolute top-[2px] left-[2px] block h-[22px] w-[22px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-all peer-checked:left-[20px]" />
    </span>
  )
}

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

function ActionRow({ icon: IconEl, label, onClick, tone = 'default' }: ActionRowProps) {
  const tonal = tone === 'debt' ? 'text-debt-deep' : 'text-text'
  const iconBg = tone === 'debt' ? 'bg-debt-soft text-debt-deep' : 'bg-bg-secondary text-text-secondary'
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-md bg-bg-elevated px-3.5 py-3 text-left shadow-card transition-all hover:bg-bg-tinted active:scale-[0.97]"
    >
      <span className={'flex h-[30px] w-[30px] items-center justify-center rounded-md ' + iconBg}>
        <IconEl size={16} stroke={2} />
      </span>
      <span className={'flex-1 text-[13px] font-bold ' + tonal}>{label}</span>
      <IconChevronRight size={14} className="text-text-tertiary" />
    </button>
  )
}
