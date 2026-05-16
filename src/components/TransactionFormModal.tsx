import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import {
  IconBackspace,
  IconCheck,
  IconX,
  type Icon,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { Confetti } from '@/components/Confetti'
import { Richeto } from '@/components/Richeto'
import { useToast } from '@/hooks/useToast'
import { categoryIcon } from '@/lib/categories'
import type { Account, Category } from '@/types'
import type { NewTransaction } from '@/hooks/useTransactions'

export type Direction = 'spend' | 'receive'

interface TransactionFormModalProps {
  open: boolean
  onClose: () => void
  accounts: Account[]
  categories: Category[]
  onCreate: (tx: NewTransaction) => Promise<void>
  initialDirection?: Direction
}

const ACCENTS = {
  spend: { color: '#FF5A5F', soft: '#FFDCDD', shadow: 'rgba(255,90,95,0.35)' },
  receive: { color: '#2BB673', soft: '#D7F2E4', shadow: 'rgba(43,182,115,0.32)' },
} as const

const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'] as const

const MAX_AMOUNT_LEN = 8

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Bottom-sheet add-movement modal (PR-5).
 *
 * Step 0: direction toggle → big amount display → category grid → account chips
 *         → custom numpad → submit button. Validation is inline (no error toasts
 *         on each invalid state — submit is disabled until valid).
 *
 * Step 1: success state with confetti, Richeto 120px, +15 XP feedback,
 *         and "Listo" button that closes the sheet.
 */
export function TransactionFormModal({
  open,
  onClose,
  accounts,
  categories,
  onCreate,
  initialDirection = 'spend',
}: TransactionFormModalProps) {
  const toast = useToast()
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  const [step, setStep] = useState<0 | 1>(0)
  const [direction, setDirection] = useState<Direction>(initialDirection)
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [accountId, setAccountId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  /* ------------ open / close animation ------------ */

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true)
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => setEntered(true))
        return () => cancelAnimationFrame(r2)
      })
      return () => cancelAnimationFrame(r1)
    }
    if (mounted) {
      setEntered(false)
      const t = window.setTimeout(() => setMounted(false), 320)
      return () => window.clearTimeout(t)
    }
  }, [open, mounted])

  /* ------------ reset state when (re)opened ------------ */

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep(0)
    setAmount('')
    setCategoryId('')
    setAccountId(accounts[0]?.id ?? '')
    setDirection(initialDirection)
    setSubmitting(false)
  }, [open, accounts, initialDirection])

  /* ------------ scroll lock + ESC ------------ */

  useEffect(() => {
    if (!mounted) return
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    const prevOverflow = document.body.style.overflow
    const prevPadding = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      const current = parseInt(window.getComputedStyle(document.body).paddingRight, 10) || 0
      document.body.style.paddingRight = `${current + scrollbarWidth}px`
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPadding
      window.removeEventListener('keydown', onKey)
    }
  }, [mounted, onClose])

  /* ------------ derived ------------ */

  const accent = ACCENTS[direction]
  const visibleCategories = useMemo(() => {
    const kinds = direction === 'spend' ? (['variable', 'fixed'] as const) : (['income'] as const)
    return categories
      .filter((c) => (kinds as readonly string[]).includes(c.kind))
      .slice(0, direction === 'spend' ? 6 : 6)
  }, [categories, direction])

  const selectedAccount = accounts.find((a) => a.id === accountId)
  const isCredit = selectedAccount?.type === 'credit'
  const amountValid = amount !== '' && Number(amount) > 0 && !Number.isNaN(Number(amount))
  const valid = amountValid && categoryId !== '' && accountId !== '' && !submitting

  /* ------------ handlers ------------ */

  function pushKey(k: (typeof NUMPAD_KEYS)[number]) {
    if (k === '⌫') {
      setAmount((v) => v.slice(0, -1))
      return
    }
    if (k === '.' && amount.includes('.')) return
    if (amount.length >= MAX_AMOUNT_LEN) return
    if (k === '.' && amount === '') {
      setAmount('0.')
      return
    }
    setAmount((v) => v + k)
  }

  async function handleSubmit() {
    if (!valid) return
    setSubmitting(true)
    const magnitude = Math.abs(Number(amount))
    // Debit: spend lowers the balance. Credit: spend raises the debt.
    const sign =
      direction === 'spend' ? (isCredit ? 1 : -1) : isCredit ? -1 : 1
    try {
      await onCreate({
        account_id: accountId,
        amount: sign * magnitude,
        category_id: categoryId || null,
        date: today(),
      })
      setStep(1)
    } catch {
      toast.error('Error al guardar', 'Ocurrió un problema al registrar el movimiento')
      setSubmitting(false)
    }
  }

  /* ------------ render ------------ */

  if (!mounted) return null

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex items-end justify-center transition-opacity duration-300',
        entered ? 'opacity-100' : 'opacity-0',
      )}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-[#1A1F36]/35 backdrop-blur-sm" />

      <div
        ref={panelRef}
        className={clsx(
          'relative w-full max-w-[480px] bg-bg shadow-lift outline-none transition-transform duration-300 ease-[cubic-bezier(0.4,1.6,0.5,1)]',
          'rounded-t-[28px] px-[18px] pt-[18px]',
          entered ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo movimiento"
      >
        {/* Header */}
        <div className="mb-2.5 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-[34px] w-[34px] place-items-center rounded-full bg-bg-secondary text-text-secondary transition-colors hover:bg-bg-tinted"
          >
            <IconX size={18} stroke={2} />
          </button>
          <p className="font-display text-[15px] font-extrabold text-text">
            {step === 0 ? 'Nuevo movimiento' : '¡Listo!'}
          </p>
          <div className="w-[34px]" />
        </div>

        {step === 0 ? (
          <Step0
            direction={direction}
            onChangeDirection={(d) => {
              setDirection(d)
              setCategoryId('')
            }}
            amount={amount}
            visibleCategories={visibleCategories}
            categoryId={categoryId}
            onPickCategory={setCategoryId}
            accounts={accounts}
            accountId={accountId}
            onPickAccount={setAccountId}
            onNumpad={pushKey}
            onSubmit={handleSubmit}
            submitting={submitting}
            valid={valid}
            accent={accent}
          />
        ) : (
          <Step1Success
            amount={amount}
            direction={direction}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Step 0 — form                                                       */
/* ------------------------------------------------------------------ */

interface Step0Props {
  direction: Direction
  onChangeDirection: (d: Direction) => void
  amount: string
  visibleCategories: Category[]
  categoryId: string
  onPickCategory: (id: string) => void
  accounts: Account[]
  accountId: string
  onPickAccount: (id: string) => void
  onNumpad: (k: (typeof NUMPAD_KEYS)[number]) => void
  onSubmit: () => void
  submitting: boolean
  valid: boolean
  accent: (typeof ACCENTS)[Direction]
}

function Step0({
  direction,
  onChangeDirection,
  amount,
  visibleCategories,
  categoryId,
  onPickCategory,
  accounts,
  accountId,
  onPickAccount,
  onNumpad,
  onSubmit,
  submitting,
  valid,
  accent,
}: Step0Props) {
  const displayAmount = amount ? Number(amount).toLocaleString('en-US') : '0'

  return (
    <div className="flex flex-col gap-3">
      {/* Direction toggle */}
      <div className="grid grid-cols-2 rounded-full bg-bg-secondary p-1">
        {(['spend', 'receive'] as Direction[]).map((d) => {
          const active = direction === d
          return (
            <button
              key={d}
              type="button"
              onClick={() => onChangeDirection(d)}
              className={clsx(
                'rounded-full px-3 py-2.5 text-[13px] font-extrabold transition-all',
                active
                  ? 'bg-bg-elevated text-text shadow-[0_2px_6px_rgba(26,31,54,0.06)]'
                  : 'text-text-secondary',
              )}
            >
              {d === 'spend' ? 'Gasto' : 'Ingreso'}
            </button>
          )
        })}
      </div>

      {/* Amount display */}
      <div className="pb-2 pt-5 text-center">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-text-tertiary">
          {direction === 'spend' ? 'Gastando' : 'Recibiendo'}
        </p>
        <p
          className="mt-1 font-display text-[54px] font-bold leading-none transition-colors"
          style={{ color: amount ? accent.color : 'var(--color-text-tertiary)' }}
        >
          {direction === 'spend' ? '−' : '+'}${displayAmount}
        </p>
      </div>

      {/* Category grid */}
      <div className="grid grid-cols-3 gap-2">
        {visibleCategories.length === 0 ? (
          <p className="col-span-3 text-center text-xs text-text-tertiary">
            Sin categorías disponibles.
          </p>
        ) : (
          visibleCategories.map((c) => (
            <CategoryButton
              key={c.id}
              category={c}
              selected={categoryId === c.id}
              onPick={() => onPickCategory(c.id)}
              accentColor={accent.color}
            />
          ))
        )}
      </div>

      {/* Account chips */}
      <div>
        <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-text-tertiary">
          Cuenta
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {accounts.map((a) => {
            const sel = accountId === a.id
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onPickAccount(a.id)}
                className={clsx(
                  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-xs font-extrabold transition-colors',
                  sel ? 'text-white' : 'bg-bg-elevated text-text shadow-card',
                )}
                style={sel ? { background: 'var(--color-text)' } : undefined}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: a.color ?? 'var(--color-primary)' }}
                />
                {a.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-2">
        {NUMPAD_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onNumpad(k)}
            aria-label={k === '⌫' ? 'Borrar' : `Tecla ${k}`}
            className="rounded-md bg-bg-elevated py-3.5 font-mono text-xl font-semibold text-text shadow-card transition-all active:scale-95 active:bg-bg-tinted"
          >
            {k === '⌫' ? (
              <IconBackspace size={20} stroke={2} className="mx-auto" />
            ) : (
              k
            )}
          </button>
        ))}
      </div>

      {/* Submit */}
      <button
        type="button"
        disabled={!valid}
        onClick={onSubmit}
        className={clsx(
          'w-full rounded-md py-3.5 text-[15px] font-extrabold transition-all',
          valid
            ? 'text-white active:scale-[0.98]'
            : 'cursor-not-allowed bg-bg-secondary text-text-tertiary',
        )}
        style={
          valid
            ? {
                background: accent.color,
                boxShadow: `0 12px 28px ${accent.shadow}`,
              }
            : undefined
        }
      >
        {submitting
          ? 'Guardando…'
          : direction === 'spend'
            ? 'Registrar gasto'
            : 'Registrar ingreso'}
      </button>
    </div>
  )
}

function CategoryButton({
  category,
  selected,
  onPick,
  accentColor,
}: {
  category: Category
  selected: boolean
  onPick: () => void
  accentColor: string
}) {
  const Icon: Icon = categoryIcon(category)
  const color = category.color ?? accentColor
  return (
    <button
      type="button"
      onClick={onPick}
      className={clsx(
        'flex flex-col items-center gap-1.5 rounded-md border-2 px-1.5 py-2.5 transition-all',
        selected ? 'text-white' : 'border-transparent bg-bg-elevated text-text shadow-card',
      )}
      style={
        selected
          ? { background: color, borderColor: color }
          : undefined
      }
    >
      <span
        className="grid h-[34px] w-[34px] place-items-center rounded-md"
        style={{
          background: selected ? 'rgba(255,255,255,0.25)' : color + '22',
        }}
      >
        {createElement(Icon, {
          size: 18,
          stroke: 2,
          color: selected ? '#fff' : color,
        })}
      </span>
      <span className="text-[11px] font-extrabold leading-tight">{category.name}</span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Step 1 — success                                                    */
/* ------------------------------------------------------------------ */

function Step1Success({
  amount,
  direction,
  onClose,
}: {
  amount: string
  direction: Direction
  onClose: () => void
}) {
  const formatted = Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  return (
    <div className="relative px-2 pb-4 pt-6 text-center">
      <Confetti />
      <div className="relative mx-auto mb-3 inline-block">
        <Richeto size={120} />
      </div>
      <p className="font-display text-2xl font-bold text-text">¡Vas con todo!</p>
      <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-text-secondary">
        {direction === 'spend' ? 'Gasto' : 'Ingreso'} de{' '}
        <b className="text-text">${formatted}</b> registrado.
        <br />
        <span className="text-primary font-extrabold">+15 XP</span> · Sigue tu racha
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary py-3.5 text-[15px] font-extrabold text-white shadow-hero transition-transform active:scale-[0.98]"
      >
        <IconCheck size={16} stroke={2.5} />
        Listo
      </button>
    </div>
  )
}
