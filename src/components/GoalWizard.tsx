import { useState } from 'react'
import { IconCheck, IconLink, IconRocket, IconX } from '@tabler/icons-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useConfig } from '@/hooks/useConfig'
import { useSubscriptions } from '@/hooks/useSubscriptions'
import { useAccounts } from '@/hooks/useAccounts'
import { calcMonthlyDisposable } from '@/lib/projections'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface Props {
  onClose: () => void
}

type GoalType = 'viaje' | 'coche' | 'emergencia' | 'ahorro' | 'personalizado'

const GOAL_TYPES: { id: GoalType; emoji: string; label: string; placeholder: string }[] = [
  { id: 'viaje',       emoji: '✈️', label: 'Viaje',       placeholder: 'Viaje a Japón' },
  { id: 'coche',       emoji: '🚗', label: 'Coche',       placeholder: 'Enganche del coche' },
  { id: 'emergencia',  emoji: '🛡️', label: 'Emergencia',  placeholder: 'Fondo de emergencia' },
  { id: 'ahorro',      emoji: '💰', label: 'Ahorro libre', placeholder: 'Ahorro sin destino fijo' },
  { id: 'personalizado', emoji: '✏️', label: 'Personalizado', placeholder: 'Mi meta' },
]

const GOAL_COLORS: Record<GoalType, string> = {
  viaje:        '#2A4BFF',
  coche:        '#F59E0B',
  emergencia:   '#10B981',
  ahorro:       '#9B7BFF',
  personalizado: '#6366F1',
}

const GOAL_ICONS: Record<GoalType, string> = {
  viaje:        'plane',
  coche:        'car',
  emergencia:   'shield',
  ahorro:       'coin',
  personalizado: 'target',
}

export function GoalWizard({ onClose }: Props) {
  const { data: config } = useConfig()
  const { data: subs } = useSubscriptions()
  const { data: accounts } = useAccounts()
  const { user } = useAuth()

  const [step, setStep] = useState(0)
  const [goalType, setGoalType] = useState<GoalType | null>(null)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [months, setMonths] = useState(12)
  const [linkedAccountIds, setLinkedAccountIds] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const disposable = config
    ? calcMonthlyDisposable(config, subs)
    : 0

  const targetNum = Number(target.replace(/,/g, '')) || 0
  const suggestedMonthly = months > 0 && targetNum > 0
    ? Math.ceil(targetNum / months)
    : 0
  const feasible = suggestedMonthly <= disposable && disposable > 0

  function handleTypeSelect(t: GoalType) {
    setGoalType(t)
    const preset = GOAL_TYPES.find((g) => g.id === t)
    if (preset && !name) setName(preset.placeholder)
    setStep(1)
  }

  async function handleCreate() {
    setError('')
    if (!goalType || !name.trim() || targetNum <= 0) {
      setError('Completa todos los campos')
      return
    }
    if (!user) {
      setError('Sesión no encontrada')
      return
    }
    setSubmitting(true)
    const today = new Date()
    const deadline = new Date(today.getFullYear(), today.getMonth() + months, today.getDate())
    try {
      // Create the goal and capture the inserted id so we can link accounts atomically.
      const { data: created, error: insErr } = await supabase
        .from('goals')
        .insert({
          user_id: user.id,
          name: name.trim(),
          icon: GOAL_ICONS[goalType],
          color: GOAL_COLORS[goalType],
          target: targetNum,
          saved: 0,
          monthly: suggestedMonthly,
          deadline: deadline.toISOString().slice(0, 10),
          is_debt: false,
          started_at: today.toISOString().slice(0, 10),
        })
        .select('id')
        .single()
      if (insErr || !created) throw insErr ?? new Error('insert failed')

      if (linkedAccountIds.size > 0) {
        await supabase.from('goal_accounts').insert(
          Array.from(linkedAccountIds).map((aid) => ({
            goal_id: created.id,
            account_id: aid,
            user_id: user.id,
          })),
        )
      }
      onClose()
    } catch {
      setError('No se pudo crear la meta. Intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  function toggleAccount(id: string) {
    setLinkedAccountIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const STEP_TITLES = [
    '¿Qué quieres lograr?',
    'Cuánto y cómo se llama',
    '¿En cuánto tiempo?',
    '¿De qué cuentas viene?',
    'Confirmar meta',
  ]

  const debitAccounts = accounts.filter((a) => a.type === 'debit')

  return (
    <Modal open title={STEP_TITLES[step]} onClose={onClose}>
      <div className="flex flex-col gap-4">

        {/* Step 0 — goal type */}
        {step === 0 && (
          <div className="grid grid-cols-2 gap-2.5">
            {GOAL_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTypeSelect(t.id)}
                className="flex flex-col items-center gap-2 rounded-2xl bg-bg-secondary p-4 text-center transition-all hover:bg-primary/5 hover:shadow-card active:scale-[0.96]"
              >
                <span className="text-3xl">{t.emoji}</span>
                <span className="text-[12.5px] font-extrabold text-text">{t.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Step 1 — name + amount */}
        {step === 1 && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-text-secondary">
                Nombre de tu meta
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={GOAL_TYPES.find((t) => t.id === goalType)?.placeholder ?? 'Mi meta'}
                className="w-full rounded-xl border border-border bg-bg-secondary px-3.5 py-2.5 text-[14px] text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-text-secondary">
                Monto objetivo
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-text-secondary">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={target}
                  onChange={(e) => setTarget(e.target.value.replace(/[^0-9,]/g, ''))}
                  placeholder="0"
                  className="w-full rounded-xl border border-border bg-bg-secondary py-2.5 pl-7 pr-3.5 text-[14px] text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <Button
              onClick={() => setStep(2)}
              disabled={!name.trim() || targetNum <= 0}
            >
              Siguiente
            </Button>
          </div>
        )}

        {/* Step 2 — timeline slider */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-bg-secondary p-4 text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-tertiary">
                Plazo
              </p>
              <p className="font-display text-[42px] font-extrabold leading-none text-text">
                {months}
              </p>
              <p className="text-[13px] font-medium text-text-secondary">meses</p>
            </div>

            <input
              type="range"
              min={1}
              max={60}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="w-full accent-primary"
            />

            <div className="flex justify-between text-[11px] font-semibold text-text-tertiary">
              <span>1 mes</span>
              <span>5 años</span>
            </div>

            {/* Aporte preview */}
            <div
              className="rounded-xl p-3.5"
              style={{ background: 'linear-gradient(135deg, var(--color-primary-tint) 0%, var(--color-bg-elevated) 100%)' }}
            >
              <p className="text-[12px] font-medium text-text-secondary">
                Aportando{' '}
                <b className="font-mono text-[14px] text-primary">
                  ${suggestedMonthly.toLocaleString()}/mes
                </b>{' '}
                llegas a tu meta en <b className="text-text">{months} meses</b>.
              </p>
              {disposable > 0 && (
                <div className="mt-2 flex items-center gap-1.5">
                  {feasible ? (
                    <>
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-asset">
                        <IconCheck size={11} stroke={3} color="#fff" />
                      </div>
                      <span className="text-[11.5px] font-semibold text-asset-deep">
                        Alcanzable con tu ingreso disponible
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100">
                        <span className="text-[10px]">⚠️</span>
                      </div>
                      <span className="text-[11.5px] font-semibold text-amber-700">
                        Requiere reducir otros gastos
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            <Button onClick={() => setStep(3)}>Siguiente</Button>
          </div>
        )}

        {/* Step 3 — link accounts (optional) */}
        {step === 3 && (
          <div className="flex flex-col gap-3">
            <p className="text-[12.5px] leading-snug text-text-secondary">
              Enlaza una o más cuentas. El progreso se actualizará automáticamente con el saldo real
              (ej: cajita Nu + apartado BBVA + CETES).
            </p>

            {debitAccounts.length === 0 ? (
              <div className="rounded-xl bg-bg-secondary p-4 text-center text-[12.5px] text-text-secondary">
                Aún no tienes cuentas de débito. Crea una en{' '}
                <b className="text-text">Cuentas</b> y vuelve aquí.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {debitAccounts.map((a) => {
                  const sel = linkedAccountIds.has(a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAccount(a.id)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
                      style={{
                        background: sel ? (a.color ?? '#6366F1') + '15' : 'var(--color-bg-secondary)',
                        borderWidth: 2,
                        borderStyle: 'solid',
                        borderColor: sel ? (a.color ?? '#6366F1') : 'transparent',
                      }}
                    >
                      <div
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[12px] font-extrabold text-white"
                        style={{ background: a.color ?? '#6B7194' }}
                      >
                        {a.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-bold text-text">{a.name}</p>
                        <p className="font-mono text-[11px] text-text-tertiary">
                          ${Math.round(a.balance).toLocaleString()}
                        </p>
                      </div>
                      {sel && <IconCheck size={18} stroke={3} color={a.color ?? '#6366F1'} />}
                    </button>
                  )
                })}
              </div>
            )}

            {linkedAccountIds.size > 0 && (
              <div className="rounded-xl bg-asset-soft p-3 text-[12px] text-asset-deep">
                <IconLink size={12} className="mr-1 inline" />
                Progreso enlazado:{' '}
                <b>
                  $
                  {Math.round(
                    accounts
                      .filter((a) => linkedAccountIds.has(a.id))
                      .reduce((s, a) => s + Number(a.balance), 0),
                  ).toLocaleString()}
                </b>
              </div>
            )}

            <Button onClick={() => setStep(4)}>
              {linkedAccountIds.size > 0 ? 'Siguiente' : 'Saltar este paso'}
            </Button>
          </div>
        )}

        {/* Step 4 — confirm */}
        {step === 4 && goalType && (
          <div className="flex flex-col gap-3">
            <div
              className="overflow-hidden rounded-xl p-5 text-white"
              style={{ background: `linear-gradient(135deg, ${GOAL_COLORS[goalType]} 0%, ${GOAL_COLORS[goalType]}BB 100%)` }}
            >
              <div className="mb-1 flex items-center gap-1.5">
                <IconRocket size={14} stroke={2} color="rgba(255,255,255,0.8)" />
                <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-white/80">
                  Tu meta
                </span>
              </div>
              <p className="font-display text-[26px] font-extrabold leading-tight">{name}</p>
              <p className="mt-1.5 font-mono text-[13px] font-semibold text-white/80">
                ${targetNum.toLocaleString()} · {months} meses ·{' '}
                ${suggestedMonthly.toLocaleString()}/mes
              </p>
              {linkedAccountIds.size > 0 && (
                <p className="mt-1 text-[11.5px] text-white/75">
                  <IconLink size={11} className="mr-1 inline" />
                  {linkedAccountIds.size} cuenta{linkedAccountIds.size === 1 ? '' : 's'} enlazada{linkedAccountIds.size === 1 ? '' : 's'}
                </p>
              )}
            </div>

            {error && (
              <p className="rounded-lg bg-debt-soft px-3 py-2 text-[12px] font-semibold text-debt">
                {error}
              </p>
            )}

            <Button loading={submitting} onClick={() => void handleCreate()}>
              Crear meta
            </Button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="py-2 text-sm font-semibold text-text-secondary"
            >
              Volver a editar
            </button>
          </div>
        )}

        {/* Step back (steps 1–3) */}
        {step > 0 && step < 4 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="flex items-center gap-1 text-[12px] font-semibold text-text-secondary"
          >
            <IconX size={13} stroke={2} /> Volver
          </button>
        )}
      </div>
    </Modal>
  )
}
