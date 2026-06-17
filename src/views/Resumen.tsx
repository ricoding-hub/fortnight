import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconArrowDown,
  IconBell,
  IconCalendarEvent,
  IconCash,
  IconCreditCard,
  IconFlame,
  IconInfoCircle,
  IconRocket,
  IconTrendingUp,
  IconTrophy,
  IconUsers,
} from '@tabler/icons-react'
import clsx from 'clsx'

import { useAuth } from '@/hooks/useAuth'
import { useAccounts } from '@/hooks/useAccounts'
import { useInstallments } from '@/hooks/useInstallments'
import { useLoans } from '@/hooks/useLoans'
import { useTransactions } from '@/hooks/useTransactions'
import { useGoals } from '@/hooks/useGoals'
import { useGamification } from '@/hooks/useGamification'
import { useScoreHistory } from '@/hooks/useScoreHistory'
import { useMissions } from '@/hooks/useMissions'
import { useConfig } from '@/hooks/useConfig'
import { useSubscriptions } from '@/hooks/useSubscriptions'

import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { SkeletonStatCard } from '@/components/ui/Skeleton'
import { PaydayBanner } from '@/components/PaydayBanner'
import { ScoreSparkline } from '@/components/ScoreSparkline'
import { Podium, type PodiumFriend } from '@/components/Podium'
import { YourRank, type RankFriend } from '@/components/YourRank'
import { MisionesCompact } from '@/components/MisionesCompact'
import { useUiStore } from '@/store/uiStore'

import { formatMXN } from '@/lib/format'
import { calculateScoreV2 } from '@/lib/score'
import { daysUntilPayment } from '@/lib/dates'
import { monthsToGoal } from '@/lib/goals'
import { useNotifications } from '@/hooks/useNotifications'
import { computePaydays, fmtPayday } from '@/lib/paydays'
import type { PayFreq } from '@/lib/paydays'

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function shortMonth(d: Date): string {
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export function Resumen() {
  const navigate = useNavigate()
  const [scoreOpen, setScoreOpen] = useState(false)
  const [heroInfoOpen, setHeroInfoOpen] = useState(false)
  const { user } = useAuth()
  const { data: accounts, loading, error } = useAccounts()
  const { active: activeLoans, data: allLoans, porCobrar: loansPorCobrar, porPagar: loansPorPagar } = useLoans()
  const { data: recentTx } = useTransactions()
  const { data: goals } = useGoals()
  const { data: gami, nextLevelXP, levelProgress } = useGamification()
  const { unreadCount } = useNotifications()
  const { snapshots: scoreSnapshots, recordIfChanged } = useScoreHistory()
  const { data: config } = useConfig()
  const { data: subs } = useSubscriptions()
  const { active: activeInstallments } = useInstallments()
  const openAddModal = useUiStore((s) => s.openAddModal)

  /* --------------------------------- derived */

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split('@')[0] ??
    'amigo'
  const avatarInitial = (displayName[0] ?? '?').toUpperCase()
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined

  const debitAccounts = accounts.filter((a) => a.type === 'debit')
  const creditAccounts = accounts.filter((a) => a.type === 'credit')
  const debitTotal = debitAccounts.reduce((s, a) => s + a.balance, 0)
  const creditDebt = creditAccounts.reduce((s, a) => s + a.balance, 0)
  const porCobrar = loansPorCobrar - loansPorPagar
  const net = debitTotal - creditDebt

  const msiMonthlyTotal = activeInstallments.reduce((s, i) => s + i.monthly_amount, 0)

  // 7-day trend — includes both transactions and adjustments (real money moves).
  const trend7d = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    const cutoffISO = cutoff.toISOString().slice(0, 10)
    return recentTx
      .filter((t) => t.date >= cutoffISO && (t.type === 'transaction' || t.type === 'adjustment'))
      .reduce((s, t) => s + Number(t.amount), 0)
  }, [recentTx])

  // Next payday chip
  const nextPayday = useMemo(() => {
    if (!config?.pay_reference || !config?.pay_freq) return null
    const ref = new Date(config.pay_reference + 'T12:00:00')
    const days = computePaydays(ref, config.pay_freq as PayFreq, 1)
    return days[0] ?? null
  }, [config])

  // ── Score V2: blends balance sheet + behavioural signals from the last 30 days
  const { monthlyIncome, monthlyExpense } = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const iso = cutoff.toISOString().slice(0, 10)
    let income = 0
    let expense = 0
    for (const t of recentTx) {
      if (t.date < iso || t.type !== 'transaction') continue
      const amt = Number(t.amount)
      if (amt > 0) income += amt
      else expense += -amt
    }
    return { monthlyIncome: income, monthlyExpense: expense }
  }, [recentTx])

  const { score, breakdown } = useMemo(
    () =>
      calculateScoreV2({
        accounts,
        streakDays: gami.streak_days,
        monthlyIncome,
        monthlyExpense,
        budgetSpendRatio: null,
      }),
    [accounts, gami.streak_days, monthlyIncome, monthlyExpense],
  )

  // Persist today's snapshot when the live score deviates from the last record.
  useEffect(() => {
    if (loading || !user) return
    void recordIfChanged(score, breakdown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, loading, user])

  // Sparkline: use real persisted points; pad with the current score if the
  // user just signed up and we have no history yet.
  const scoreHistory = useMemo(() => {
    if (scoreSnapshots.length === 0) return [score]
    const points = [...scoreSnapshots].reverse().map((s) => Number(s.score))
    if (points.length === 1) return [points[0], score]
    return points
  }, [scoreSnapshots, score])

  const scoreInt = Math.round(score)
  const scoreTier = scoreInt >= 8 ? 'Top' : scoreInt >= 5 ? 'Mejorando' : 'En reto'
  const scoreColor = scoreInt >= 8 ? '#2BB673' : scoreInt >= 5 ? '#9B7BFF' : '#FF5A5F'
  const scoreDelta =
    Math.round((scoreHistory[scoreHistory.length - 1] - scoreHistory[0]) * 10) / 10

  const unlockedAchievements = [
    recentTx.length >= 1,
    gami.streak_days >= 7,
    score >= 5,
    gami.xp >= 500,
  ].filter(Boolean).length

  // Mes libre de deuda — projected month/year from the primary goal (falling
  // back to any debt goal so existing users see something on day one).
  const primaryGoal = useMemo(
    () => goals.find((g) => g.is_primary) ?? goals.find((g) => g.is_debt) ?? null,
    [goals],
  )
  const mesLibre = useMemo(() => {
    if (!primaryGoal) return null
    const m = monthsToGoal(primaryGoal)
    if (!Number.isFinite(m)) return null
    const d = new Date()
    d.setMonth(d.getMonth() + m)
    return d
  }, [primaryGoal])

  const urgent = creditAccounts
    .map((a) => ({ account: a, days: daysUntilPayment(a) }))
    .filter((x): x is { account: typeof x.account; days: number } => x.days != null && x.days <= 5)
    .sort((a, b) => a.days - b.days)
  const nextUrgent = urgent[0]
  const urgentLabel = nextUrgent
    ? nextUrgent.days <= 0
      ? `Paga ${nextUrgent.account.name} hoy`
      : `${nextUrgent.account.name} en ${nextUrgent.days} día${nextUrgent.days === 1 ? '' : 's'}`
    : ''

  const streak = gami.streak_days

  // Missions — driven by useMissions, which fetches this week's claims and
  // auto-awards XP the moment a mission hits 100%.
  const missionCtx = useMemo(() => {
    const cutoff7 = new Date()
    cutoff7.setDate(cutoff7.getDate() - 7)
    const cutoffISO = cutoff7.toISOString().slice(0, 10)
    const weekTx = recentTx.filter((t) => t.date >= cutoffISO && t.type === 'transaction')
    const weekDebtPayments = weekTx
      .filter((t) => {
        const acc = accounts.find((a) => a.id === t.account_id)
        return acc?.type === 'credit' && Number(t.amount) < 0
      })
      .reduce((s, t) => s + -Number(t.amount), 0)
    const weekAdjustmentCount = recentTx.filter(
      (t) => t.date >= cutoffISO && t.type === 'adjustment',
    ).length
    const weekCategorizedTxCount = weekTx.filter((t) => t.category_id != null).length
    const loanPaidThisWeek = allLoans.some(
      (l) => l.paid_at != null && l.paid_at.slice(0, 10) >= cutoffISO,
    )
    return {
      weekTxCount: weekTx.length,
      score,
      weekDebtPayments,
      weekAdjustmentCount,
      hasActiveLoan: activeLoans.length > 0,
      hasActiveSubscription: subs.some((s) => s.active),
      loanPaidThisWeek,
      weekCategorizedTxCount,
    }
  }, [recentTx, accounts, score, allLoans, activeLoans, subs])

  const { missions } = useMissions(missionCtx)

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
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="h-11 w-11 rounded-full object-cover shadow-[0_6px_14px_rgba(42,75,255,0.28)]"
            />
          ) : (
            <span
              className="grid h-11 w-11 place-items-center rounded-full font-display text-lg font-extrabold text-white shadow-[0_6px_14px_rgba(42,75,255,0.28)]"
              style={{ background: 'linear-gradient(135deg, #2A4BFF 0%, #9B7BFF 100%)' }}
            >
              {avatarInitial}
            </span>
          )}
          <span
            className="absolute -bottom-1 -right-1 rounded-md bg-lavender px-1.5 py-0.5 font-mono text-[9px] font-extrabold text-white"
            style={{ boxShadow: '0 0 0 2px var(--color-bg)' }}
          >
            LV{gami.level}
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
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.round(levelProgress * 100)}%`,
                  background: 'linear-gradient(90deg, #2A4BFF, #9B7BFF)',
                }}
              />
            </div>
            <span className="font-mono text-[10px] font-semibold text-text-tertiary">
              {gami.xp}/{nextLevelXP} XP
            </span>
          </div>
        </button>

        <button
          type="button"
          aria-label="Notificaciones"
          onClick={() => navigate('/notificaciones')}
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bg-elevated shadow-card transition-all hover:bg-bg-tinted active:scale-95"
        >
          <IconBell
            size={18}
            stroke={2}
            className={unreadCount > 0 ? 'text-text' : 'text-text-secondary'}
          />
          {unreadCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-debt px-1 font-mono text-[9px] font-extrabold text-white"
              style={{ boxShadow: '0 0 0 2px var(--color-bg-elevated)' }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </header>

      {/* ── Payday banner — only fires on payday ── */}
      <PaydayBanner onApply={() => openAddModal('receive')} />

      {/* ── Hero balance — deep-ink card with split bar ── */}
      <section id="tour-hero" className="px-4 pt-1">
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

          {/* Title row */}
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[10.5px] font-extrabold uppercase tracking-[0.13em] text-white/55">
                Balance neto
              </span>
              <button
                type="button"
                onClick={() => setHeroInfoOpen(true)}
                aria-label="Cómo se calculan estos números"
                className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white/15 text-white/60 transition-colors hover:bg-white/25"
              >
                <IconInfoCircle size={10} stroke={2} />
              </button>
            </div>
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

          {/* Big number */}
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
          <div className="relative mt-1 flex items-center gap-3">
            <p className="text-[11.5px] font-medium text-white/55">activos — deuda total</p>
            {nextPayday && (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10.5px] font-semibold text-white/75 backdrop-blur-sm">
                <IconCalendarEvent size={10} stroke={2} />
                Cobro: {fmtPayday(nextPayday)}
              </span>
            )}
          </div>

          {/* Activos / Deuda split bar */}
          <div className="relative mt-4">
            {debitTotal + creditDebt > 0 ? (
              <div className="flex h-[7px] w-full overflow-hidden rounded-full">
                <div
                  style={{
                    width: `${Math.max(2, Math.min(98, (debitTotal / (debitTotal + creditDebt)) * 100))}%`,
                    background: 'linear-gradient(90deg, #2BB673, #5DD296)',
                  }}
                />
                <div
                  className="flex-1"
                  style={{ background: 'linear-gradient(90deg, #FF5A5F, #FF8A65)' }}
                />
              </div>
            ) : (
              <div className="h-[7px] w-full rounded-full bg-white/10" />
            )}
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: '#5DD296', boxShadow: '0 0 5px rgba(93,210,150,0.8)' }}
                />
                <span className="text-[11px] font-bold text-white/65">
                  Activos {formatMXN(debitTotal)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-white/65">
                  {formatMXN(creditDebt)} Deuda
                </span>
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: '#FF5A5F', boxShadow: '0 0 5px rgba(255,90,95,0.8)' }}
                />
              </div>
            </div>
          </div>

          {/* Cuotas mensuales MSI — only when there are active plans */}
          {activeInstallments.length > 0 && (
            <div className="relative mt-3 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/8 px-3 py-2.5">
              <div
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                style={{ background: 'rgba(155,123,255,0.25)' }}
              >
                <IconCalendarEvent size={14} color="#9B7BFF" stroke={2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9.5px] font-bold uppercase tracking-wide text-white/50">
                  Cuotas mensuales
                </p>
                <p className="font-mono text-[13.5px] font-bold text-white">
                  {formatMXN(msiMonthlyTotal)}
                </p>
              </div>
              <span className="shrink-0 text-[9.5px] font-semibold text-white/40">
                {activeInstallments.length} plan{activeInstallments.length === 1 ? '' : 'es'}
              </span>
            </div>
          )}

        </div>
      </section>

      {/* ── Score card with ring + sparkline ── */}
      <section id="tour-score" className="px-4 pt-2">
        <button
          type="button"
          className="w-full text-left transition-transform active:scale-[0.985]"
          onClick={() => setScoreOpen(true)}
          aria-label="Ver desglose del score financiero"
        >
          <Card className="p-4">
            <div className="flex items-center gap-3.5">
              <ScoreRing score={scoreInt} color={scoreColor} />
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-1.5">
                  <span className="text-sm font-extrabold text-text">Score financiero</span>
                  <span className="rounded-full bg-lavender-soft px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-lavender-deep">
                    {scoreTier}
                  </span>
                  <IconInfoCircle size={13} className="ml-auto text-text-tertiary" />
                </div>
                <p className="mb-2 text-[11.5px] font-semibold text-text-secondary">
                  <span className={`font-extrabold ${scoreDelta >= 0 ? 'text-asset-deep' : 'text-debt'}`}>
                    {scoreDelta >= 0 ? `+${scoreDelta}` : String(scoreDelta)}
                  </span>{' '}
                  esta semana · meta <b className="text-text">7</b>
                </p>
                <ScoreSparkline data={scoreHistory} />
              </div>
            </div>
          </Card>
        </button>
      </section>

      <ScoreBreakdownSheet
        open={scoreOpen}
        onClose={() => setScoreOpen(false)}
        score={score}
        scoreColor={scoreColor}
        scoreTier={scoreTier}
        breakdown={breakdown}
      />

      <Modal open={heroInfoOpen} onClose={() => setHeroInfoOpen(false)} title="Cómo se calculan estos números">
        <div className="flex flex-col gap-4 text-[13px]">
          <HeroInfoBlock
            color="#5DD296"
            title="Balance neto"
            body="Tus activos en débito menos tu deuda total en tarjetas. Positivo = tus ahorros superan tus deudas. Negativo = debes más de lo que tienes."
          />
          <HeroInfoBlock
            color="#5DD296"
            title="Activos vs Deuda (barra)"
            body="La proporción verde muestra tus cuentas de débito; el rojo, tu deuda en tarjetas. Más verde = mejor salud financiera."
          />
          <HeroInfoBlock
            color="#9B7BFF"
            title="Cuotas mensuales"
            body="La suma fija de tus mensualidades MSI activas. Es el compromiso de pago mensual que ya está acordado con la tienda o banco, independientemente del saldo total de tu tarjeta."
          />
          <HeroInfoBlock
            color="#6366F1"
            title="¿Cuándo registro un plan a meses?"
            body='Cuando compraste algo en "X meses sin interés". Ve a Cuentas → "Meses sin interés" y regístralo para que la app lo separe de tu deuda libre.'
          />
        </div>
      </Modal>

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
                  {urgentLabel}
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
          label="Préstamos"
          value={`$${porCobrar.toLocaleString()}`}
          color="#2A4BFF"
          softColor="var(--color-primary-soft)"
        />
        <button
          type="button"
          onClick={() => navigate('/perfil')}
          aria-label="Ver logros"
          className="relative text-left transition-transform active:scale-[0.96]"
        >
          <MiniStat
            icon={IconTrophy}
            label="Logros"
            value={`${unlockedAchievements} / 4`}
            color="#9B7BFF"
            softColor="var(--color-lavender-soft)"
          />
        </button>
      </section>

      {/* ── Misiones de la semana ── */}
      <SectionHeader right={<span className="text-[11px] font-bold text-primary">{missions.length} activas</span>}>
        Misiones de la semana
      </SectionHeader>
      <section className="px-4 pb-2">
        <MisionesCompact missions={missions} />
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

function HeroInfoBlock({ color, title, body }: { color: string; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <div
        className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
        style={{ background: color, marginTop: '3px' }}
      />
      <div>
        <p className="font-bold text-text">{title}</p>
        <p className="mt-0.5 leading-relaxed text-text-secondary">{body}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Score breakdown bottom sheet                                         */
/* ------------------------------------------------------------------ */

interface ScoreBreakdownSheetProps {
  open: boolean
  onClose: () => void
  score: number
  scoreColor: string
  scoreTier: string
  breakdown: import('@/lib/score').ScoreBreakdown
}

const SIGNAL_META = [
  {
    key: 'utilization' as const,
    label: 'Utilización de crédito',
    weight: 30,
    description: 'Qué tan lejos estás de tu límite total de tarjetas.',
    goodLabel: 'baja utilización',
  },
  {
    key: 'liquidity' as const,
    label: 'Liquidez',
    weight: 20,
    description: 'Efectivo en cuentas versus deuda total.',
    goodLabel: 'más efectivo que deuda',
  },
  {
    key: 'savingsRate' as const,
    label: 'Tasa de ahorro',
    weight: 20,
    description: 'Porcentaje del ingreso que no gastas (últimos 30 días). Meta: 40%.',
    goodLabel: 'ahorrando 40%+',
  },
  {
    key: 'streak' as const,
    label: 'Racha de registro',
    weight: 15,
    description: 'Consistencia diaria. 21 días continuos = puntaje completo.',
    goodLabel: '21 días de racha',
  },
  {
    key: 'budgetAdherence' as const,
    label: 'Apego al presupuesto',
    weight: 15,
    description: 'Qué tan cerca estás del gasto planeado. Sin plan activo = neutro.',
    goodLabel: 'dentro del plan',
  },
]

function SignalBar({ value, color }: { value: number; color: string }) {
  return (
    <div
      className="h-2 flex-1 overflow-hidden rounded-full"
      style={{ background: color + '20' }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.round(value * 100)}%`, background: color }}
      />
    </div>
  )
}

function signalColor(v: number): string {
  if (v >= 0.7) return '#10B981'
  if (v >= 0.4) return '#9B7BFF'
  return '#EF4444'
}

function ScoreBreakdownSheet({
  open,
  onClose,
  score,
  scoreColor,
  scoreTier,
  breakdown,
}: ScoreBreakdownSheetProps) {
  return (
    <Modal open={open} onClose={onClose} title="Score financiero">
      {/* Hero row */}
      <div className="mb-4 flex items-center gap-4 rounded-xl p-4" style={{ background: scoreColor + '12' }}>
        <ScoreRing score={Math.round(score)} color={scoreColor} />
        <div>
          <p className="font-display text-3xl font-extrabold leading-none" style={{ color: scoreColor }}>
            {score}
            <span className="ml-1 text-base font-bold text-text-tertiary">/ 10</span>
          </p>
          <span
            className="mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-extrabold"
            style={{ background: scoreColor + '22', color: scoreColor }}
          >
            {scoreTier}
          </span>
          <p className="mt-1 text-[11px] text-text-tertiary">
            Meta <b className="text-text">7.0</b> · Excelente <b className="text-text">8.5</b>
          </p>
        </div>
      </div>

      {/* Signal breakdown */}
      <div className="flex flex-col gap-3.5">
        {SIGNAL_META.map((sig) => {
          const val = breakdown[sig.key]
          const col = signalColor(val)
          const pts = Math.round(val * sig.weight * 10) / 10
          return (
            <div key={sig.key}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="flex-1 text-[12.5px] font-bold text-text">{sig.label}</span>
                <span
                  className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-extrabold"
                  style={{ background: col + '18', color: col }}
                >
                  {pts.toFixed(1)} pts
                </span>
                <span className="shrink-0 text-[10px] font-semibold text-text-tertiary">
                  peso {sig.weight}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <SignalBar value={val} color={col} />
                <span className="w-8 text-right font-mono text-[11px] font-bold" style={{ color: col }}>
                  {Math.round(val * 100)}%
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-text-tertiary">
                {sig.description}
              </p>
            </div>
          )
        })}
      </div>

      <p className="mt-5 text-center text-[10.5px] text-text-tertiary">
        Basado en tus últimos 30 días · Se recalcula al cambiar saldos
      </p>
    </Modal>
  )
}
