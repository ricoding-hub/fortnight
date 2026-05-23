import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconArrowDown,
  IconBell,
  IconCalendarEvent,
  IconCash,
  IconCreditCard,
  IconFlame,
  IconRocket,
  IconTarget,
  IconTrendingUp,
  IconTrophy,
  IconUsers,
} from '@tabler/icons-react'
import clsx from 'clsx'

import { useAuth } from '@/hooks/useAuth'
import { useAccounts } from '@/hooks/useAccounts'
import { useLoans } from '@/hooks/useLoans'
import { useTransactions } from '@/hooks/useTransactions'
import { useGoals } from '@/hooks/useGoals'

import { Card } from '@/components/ui/Card'
import { SkeletonStatCard } from '@/components/ui/Skeleton'
import { PaydayBanner } from '@/components/PaydayBanner'
import { ScoreSparkline } from '@/components/ScoreSparkline'
import { Podium, type PodiumFriend } from '@/components/Podium'
import { YourRank, type RankFriend } from '@/components/YourRank'
import { MisionesCompact, type Mission } from '@/components/MisionesCompact'
import { useUiStore } from '@/store/uiStore'

import { formatMXN } from '@/lib/format'
import { calculateScore } from '@/lib/score'
import { daysUntilDayOfMonth } from '@/lib/dates'
import { monthsToGoal } from '@/lib/goals'

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function shortMonth(d: Date): string {
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

/** Derive a 7-point sparkline from the current score (placeholder for score_history). */
function syntheticScoreHistory(score: number): number[] {
  // Small downward-trending jitter ending at the real score — purely visual.
  const out: number[] = []
  for (let i = 6; i >= 0; i--) {
    const drift = Math.sin(i * 1.1) * 0.4
    out.push(Math.max(1, Math.min(10, Math.round((score - i * 0.15 + drift) * 10) / 10)))
  }
  out[out.length - 1] = score
  return out
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export function Resumen() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: accounts, loading, error } = useAccounts()
  const { active: activeLoans } = useLoans()
  const { data: recentTx } = useTransactions()
  const { data: goals } = useGoals()
  const openAddModal = useUiStore((s) => s.openAddModal)

  const [completedMissionId, setCompletedMissionId] = useState<string | null>(null)

  /* --------------------------------- derived */

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split('@')[0] ??
    'amigo'
  const avatarInitial = (displayName[0] ?? '?').toUpperCase()

  const debitAccounts = accounts.filter((a) => a.type === 'debit')
  const creditAccounts = accounts.filter((a) => a.type === 'credit')
  const debitTotal = debitAccounts.reduce((s, a) => s + a.balance, 0)
  const creditDebt = creditAccounts.reduce((s, a) => s + a.balance, 0)
  const porCobrar = activeLoans.reduce((s, l) => s + l.amount, 0)
  const net = debitTotal - creditDebt

  // 7-day trend — sum of signed amounts on transactions in the last 7 days.
  const trend7d = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    const cutoffISO = cutoff.toISOString().slice(0, 10)
    return recentTx
      .filter((t) => t.date >= cutoffISO && t.type === 'transaction')
      .reduce((s, t) => s + Number(t.amount), 0)
  }, [recentTx])

  const score = calculateScore(accounts)
  const scoreHistory = useMemo(() => syntheticScoreHistory(score), [score])
  const scoreTier = score >= 8 ? 'Top' : score >= 5 ? 'Mejorando' : 'En reto'
  const scoreColor = score >= 8 ? '#2BB673' : score >= 5 ? '#9B7BFF' : '#FF5A5F'

  // Mes libre de deuda — projected month/year if a debt goal exists.
  const debtGoal = goals.find((g) => g.is_debt)
  const mesLibre = useMemo(() => {
    if (!debtGoal) return null
    const m = monthsToGoal(debtGoal)
    if (!Number.isFinite(m)) return null
    const d = new Date()
    d.setMonth(d.getMonth() + m)
    return d
  }, [debtGoal])

  const urgent = creditAccounts
    .filter((a) => a.payment_due_day != null)
    .map((a) => ({ account: a, days: daysUntilDayOfMonth(a.payment_due_day!) }))
    .filter((x) => x.days <= 5)
    .sort((a, b) => a.days - b.days)
  const nextUrgent = urgent[0]

  // Streak — unique tx days proxy (gamification table is out of scope for PR-4).
  const uniqueDays = new Set(recentTx.map((t) => t.date))
  const streak = uniqueDays.size

  // Missions — starter set with progress derived from real signals.
  const missions: Mission[] = useMemo(() => {
    const cutoff7 = new Date()
    cutoff7.setDate(cutoff7.getDate() - 7)
    const cutoffISO = cutoff7.toISOString().slice(0, 10)
    const last7TxCount = recentTx.filter((t) => t.date >= cutoffISO).length

    return [
      {
        id: 'log-3',
        title: 'Registra 3 gastos esta semana',
        progress: Math.min(last7TxCount, 3),
        total: 3,
        reward: 20,
        icon: IconFlame,
        color: '#FF5A5F',
      },
      {
        id: 'score-up',
        title: 'Mantén tu score en 5+',
        progress: score >= 5 ? 1 : 0,
        total: 1,
        reward: 50,
        icon: IconTarget,
        color: '#2A4BFF',
      },
      {
        id: 'apply-plan',
        title: 'Aplica tu plan en día de pago',
        progress: 0,
        total: 1,
        reward: 100,
        icon: IconRocket,
        color: '#9B7BFF',
      },
    ]
  }, [recentTx, score])

  // Friends data is gated behind a future gamification migration — Liga is
  // hidden when there's nothing to show.
  const friends: (PodiumFriend & RankFriend)[] = []

  /* --------------------------------- loading / error */

  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-4 animate-[fade-in_300ms_ease-out]">
        <div className="h-40 rounded-xl shimmer" />
        <div className="grid grid-cols-2 gap-3">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <Card className="border-debt/20 bg-debt/5">
          <p className="text-sm font-medium text-debt">No se pudo cargar el resumen.</p>
          <p className="mt-1 text-xs text-text-secondary">
            Revisa tu conexión e intenta de nuevo.
          </p>
        </Card>
      </div>
    )
  }

  /* --------------------------------- render */

  const activosShown = debitTotal
  const deudaShown = creditDebt
  const assetsRatio = activosShown + deudaShown > 0
    ? activosShown / (activosShown + deudaShown)
    : 1

  return (
    <div className="flex flex-col animate-[fade-in_300ms_ease-out]">
      {/* ── Header: avatar + greeting + XP bar + bell ── */}
      <header className="flex items-center gap-3 px-4 pb-2 pt-2.5 lg:pt-1">
        <button
          type="button"
          onClick={() => navigate('/perfil')}
          aria-label="Abrir perfil"
          className="relative shrink-0 transition-transform active:scale-95"
        >
          <span
            className="grid h-11 w-11 place-items-center rounded-full font-display text-lg font-extrabold text-white shadow-[0_6px_14px_rgba(42,75,255,0.28)]"
            style={{
              background: 'linear-gradient(135deg, #2A4BFF 0%, #9B7BFF 100%)',
            }}
          >
            {avatarInitial}
          </span>
          <span
            className="absolute -bottom-1 -right-1 rounded-md bg-lavender px-1.5 py-0.5 font-mono text-[9px] font-extrabold text-white"
            style={{ boxShadow: '0 0 0 2px var(--color-bg)' }}
          >
            LV1
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/perfil')}
          className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left"
        >
          <p className="truncate text-sm font-extrabold text-text">
            ¡Qué tal, {displayName}!
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <div className="h-[5px] max-w-[130px] flex-1 overflow-hidden rounded-full bg-primary-soft">
              <div
                className="h-full rounded-full"
                style={{
                  width: '0%',
                  background: 'linear-gradient(90deg, #2A4BFF, #9B7BFF)',
                }}
              />
            </div>
            <span className="font-mono text-[10px] font-semibold text-text-tertiary">
              0/500 XP
            </span>
          </div>
        </button>

        <button
          type="button"
          aria-label="Notificaciones"
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bg-elevated shadow-card transition-colors hover:bg-bg-tinted"
        >
          <IconBell size={18} stroke={2} className="text-text-secondary" />
          <span
            className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-debt"
            style={{ boxShadow: '0 0 0 2px var(--color-bg-elevated)' }}
          />
        </button>
      </header>

      {/* ── Payday banner — only fires on payday ── */}
      <PaydayBanner onApply={() => openAddModal('receive')} />

      {/* ── Hero balance — deep-ink card with split bar ── */}
      <section className="px-4 pt-1">
        <div
          className="relative overflow-hidden rounded-xl px-5 py-5 text-white shadow-hero"
          style={{
            background:
              'linear-gradient(135deg, #1A1F36 0%, #232944 60%, #2A3158 100%)',
          }}
        >
          <div
            className="absolute -right-10 -top-14 h-44 w-44 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(155,123,255,0.25) 0%, transparent 70%)' }}
          />
          <div
            className="absolute -right-6 -bottom-12 h-36 w-36 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(255,90,95,0.22) 0%, transparent 70%)' }}
          />

          <div className="relative flex items-center justify-between">
            <span className="text-[10.5px] font-extrabold uppercase tracking-[0.13em] text-white/55">
              Balance neto
            </span>
            <span
              className={clsx(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[10.5px] font-extrabold',
                trend7d >= 0
                  ? 'border-asset/40 bg-asset/20 text-[#5DD296]'
                  : 'border-debt/40 bg-debt/20 text-[#FF8488]',
              )}
            >
              {trend7d >= 0 ? (
                <IconTrendingUp size={11} stroke={2.5} />
              ) : (
                <IconArrowDown size={11} stroke={2.5} />
              )}
              {trend7d >= 0 ? '+' : '−'}${Math.abs(Math.round(trend7d)).toLocaleString()} · 7d
            </span>
          </div>

          <p
            className="relative mt-2 font-display text-[44px] font-extrabold leading-[1.05] tracking-tight"
            style={{
              background: 'linear-gradient(180deg, #FFFFFF 0%, #FFB7BA 130%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {formatMXN(net)}
          </p>
          <p className="relative mt-1 text-[11.5px] font-medium text-white/55">
            activos − deuda total
          </p>

          {/* Stacked split bar */}
          <div className="relative mt-4">
            <div
              className="flex h-2.5 overflow-hidden rounded-full"
              style={{
                background: 'rgba(255,255,255,0.06)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)',
              }}
            >
              <div
                style={{
                  width: `${assetsRatio * 100}%`,
                  background: 'linear-gradient(90deg, #2BB673 0%, #5DD296 100%)',
                }}
              />
              <div
                className="flex-1"
                style={{ background: 'linear-gradient(90deg, #FF5A5F 0%, #FF8085 100%)' }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] font-bold">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full bg-asset"
                  style={{ boxShadow: '0 0 8px rgba(43,182,115,0.6)' }}
                />
                <span className="text-white/70">Activos</span>
                <span className="font-mono text-white">
                  ${(activosShown / 1000).toFixed(1)}k
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-white">
                  ${(deudaShown / 1000).toFixed(1)}k
                </span>
                <span className="text-white/70">Deuda</span>
                <span
                  className="h-2 w-2 rounded-full bg-debt"
                  style={{ boxShadow: '0 0 8px rgba(255,90,95,0.6)' }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Score card with ring + sparkline ── */}
      <section className="px-4 pt-2">
        <Card className="p-4">
          <div className="flex items-center gap-3.5">
            <ScoreRing score={score} color={scoreColor} />
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-1.5">
                <span className="text-sm font-extrabold text-text">Score financiero</span>
                <span className="rounded-full bg-lavender-soft px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-lavender-deep">
                  {scoreTier}
                </span>
              </div>
              <p className="mb-2 text-[11.5px] font-semibold text-text-secondary">
                <span className="font-extrabold text-asset-deep">+0</span> esta semana · meta{' '}
                <b className="text-text">7</b>
              </p>
              <ScoreSparkline data={scoreHistory} />
            </div>
          </div>
        </Card>
      </section>

      {/* ── Streak + Mes libre dual cards ── */}
      <section className="grid grid-cols-2 gap-2 px-4 pt-2">
        <Card className="flex items-center gap-2.5 p-3">
          <div
            className="grid h-[34px] w-[34px] place-items-center rounded-md"
            style={{
              background: 'linear-gradient(135deg, #FF5A5F 0%, #FF8A65 100%)',
              boxShadow: '0 4px 10px rgba(255,90,95,0.3)',
            }}
          >
            <IconFlame size={18} fill="#fff" stroke="#fff" />
          </div>
          <div>
            <p className="font-display text-base font-extrabold leading-none text-text">
              {streak} días
            </p>
            <p className="mt-1 text-[10.5px] font-semibold text-text-tertiary">
              de racha
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-2.5 p-3">
          <div
            className="grid h-[34px] w-[34px] place-items-center rounded-md"
            style={{
              background: 'linear-gradient(135deg, #2BB673 0%, #5DD296 100%)',
              boxShadow: '0 4px 10px rgba(43,182,115,0.3)',
            }}
          >
            <IconRocket size={18} stroke={2} color="#fff" />
          </div>
          <div>
            <p className="font-display text-base font-extrabold leading-none text-text">
              {mesLibre ? shortMonth(mesLibre) : '—'}
            </p>
            <p className="mt-1 text-[10.5px] font-semibold text-text-tertiary">
              libre de deuda
            </p>
          </div>
        </Card>
      </section>

      {/* ── Pago próximo alert (only when payment due ≤5 days) ── */}
      {nextUrgent && (
        <section className="px-4 pt-2">
          <Card
            className="flex items-center justify-between p-3"
            style={{
              background:
                'linear-gradient(135deg, var(--color-debt-soft) 0%, var(--color-bg-elevated) 100%)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="grid h-[42px] w-[42px] place-items-center rounded-md bg-debt"
                style={{ boxShadow: '0 6px 14px rgba(255,90,95,0.35)' }}
              >
                <IconCalendarEvent size={20} stroke={2} color="#fff" />
              </div>
              <div>
                <p className="text-[13.5px] font-extrabold text-text">
                  {nextUrgent.account.name} en {nextUrgent.days} día{nextUrgent.days === 1 ? '' : 's'}
                </p>
                <p className="font-mono text-[11px] text-text-secondary">
                  ${nextUrgent.account.balance.toLocaleString()}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openAddModal('spend')}
              className="rounded-full bg-debt px-3.5 py-1.5 text-[11.5px] font-extrabold text-white transition-transform active:scale-[0.97]"
            >
              Pagar
            </button>
          </Card>
        </section>
      )}

      {/* ── Liga de amigos — hidden until friends data exists ── */}
      {friends.length >= 3 && (
        <>
          <SectionHeader right={<span className="text-[11px] font-bold text-primary">Ver todos</span>}>
            Liga de amigos
          </SectionHeader>
          <section className="px-4 pb-2">
            <Card className="p-3.5">
              <Podium friends={friends.slice(0, 3)} />
              <YourRank friends={friends} />
            </Card>
          </section>
        </>
      )}

      {/* ── Tu mes grid ── */}
      <SectionHeader>Tu mes</SectionHeader>
      <section className="grid grid-cols-2 gap-2.5 px-4 pb-2">
        <MiniStat
          icon={IconCash}
          label="Activos"
          value={`$${activosShown.toLocaleString()}`}
          color="#2BB673"
          softColor="var(--color-asset-soft)"
        />
        <MiniStat
          icon={IconCreditCard}
          label="Deuda"
          value={`$${deudaShown.toLocaleString()}`}
          color="#FF5A5F"
          softColor="var(--color-debt-soft)"
        />
        <MiniStat
          icon={IconUsers}
          label="Por cobrar"
          value={`$${porCobrar.toLocaleString()}`}
          color="#2A4BFF"
          softColor="var(--color-primary-soft)"
        />
        <MiniStat
          icon={IconTrophy}
          label="Logros"
          value="0 / 4"
          color="#9B7BFF"
          softColor="var(--color-lavender-soft)"
        />
      </section>

      {/* ── Misiones de la semana ── */}
      <SectionHeader right={<span className="text-[11px] font-bold text-primary">3 activas</span>}>
        Misiones de la semana
      </SectionHeader>
      <section className="px-4 pb-2">
        <MisionesCompact
          missions={missions}
          onToggle={setCompletedMissionId}
          completedId={completedMissionId}
        />
      </section>

      {/* Bottom spacer for tab bar */}
      <div className="h-24" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Local helpers — Resumen-only presentational pieces                  */
/* ------------------------------------------------------------------ */

function SectionHeader({
  children,
  right,
}: {
  children: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-4 pb-2 pt-4">
      <h2 className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-text-tertiary">
        {children}
      </h2>
      {right}
    </div>
  )
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  const size = 72
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, score / 10))
  const offset = c * (1 - pct)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color + '22'} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.4, 1.6, 0.5, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="font-display text-xl font-extrabold leading-none" style={{ color }}>
            {score}
          </p>
          <p className="text-[8.5px] font-bold tracking-wide text-text-tertiary">/ 10</p>
        </div>
      </div>
    </div>
  )
}

function MiniStat({
  icon: Icon,
  label,
  value,
  color,
  softColor,
}: {
  icon: typeof IconCash
  label: string
  value: string
  color: string
  softColor: string
}) {
  return (
    <Card className="p-3.5">
      <div
        className="mb-2 grid h-[30px] w-[30px] place-items-center rounded-md"
        style={{ background: softColor }}
      >
        <Icon size={16} stroke={2} color={color} />
      </div>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-text">
        {value}
      </p>
    </Card>
  )
}
