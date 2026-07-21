import { createElement, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { useAuth } from '@/hooks/useAuth'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { AccountLinkField } from '@/components/split/AccountLinkField'
import { computeShares, fromCents, toCents, SplitValidationError } from '@/lib/split'
import { buildEditInputs } from '@/lib/splitEdit'
import { categoryIcon, categoryColor } from '@/lib/categories'
import { guessCategory } from '@/lib/categoryMatch'
import { formatMXN } from '@/lib/format'
import { memberIsMe, type NewExpense } from '@/hooks/useSplitGroups'
import type { SplitExpense, SplitExpenseShare, SplitMember, SplitMethod } from '@/types'

const METHOD_LABELS: Record<SplitMethod, string> = {
  equal: 'Igual',
  percentage: '%',
  exact: 'Exacto',
  shares: 'Partes',
}

interface ExpenseFormModalProps {
  open: boolean
  onClose: () => void
  members: SplitMember[]
  /** When set, the modal opens prefilled and submits as an edit. */
  editing?: { expense: SplitExpense; shares: SplitExpenseShare[] } | null
  onSubmit: (expense: NewExpense) => Promise<void>
}

export function ExpenseFormModal({ open, onClose, members, editing = null, onSubmit }: ExpenseFormModalProps) {
  const { user } = useAuth()
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  // Categories worth tagging a shared expense with (income makes no sense here).
  const pickableCategories = useMemo(
    () => categories.filter((c) => c.kind !== 'income'),
    [categories],
  )

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  /** Once the user picks a category by hand, stop auto-suggesting over it. */
  const [categoryTouched, setCategoryTouched] = useState(false)
  const [method, setMethod] = useState<SplitMethod>('equal')
  /** memberId → raw input (pct / parts / exact pesos, per method). */
  const [inputs, setInputs] = useState<Record<string, string>>({})
  /** memberIds participating in the split (equal method). */
  const [participants, setParticipants] = useState<Set<string>>(new Set())
  const [linkAccount, setLinkAccount] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const isEdit = editing != null
  // memberIsMe (not is_me): a joined member's row has is_me=false — only
  // member_user_id identifies them. Using is_me broke non-owner members.
  const me = members.find((m) => memberIsMe(m, user?.id))

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLinkAccount(false)
      setAccountId('')
      setFormError('')
      if (editing) {
        const state = buildEditInputs(editing.expense, editing.shares)
        setDescription(editing.expense.description)
        setAmount(String(Number(editing.expense.amount)))
        setPaidBy(editing.expense.paid_by_member_id)
        setCategoryId(editing.expense.category_id)
        setCategoryTouched(true) // keep the saved category; don't overwrite it
        setMethod(state.method)
        setInputs(state.inputs)
        setParticipants(new Set(state.participantIds))
      } else {
        setDescription('')
        setAmount('')
        setPaidBy(me?.id ?? members[0]?.id ?? '')
        setCategoryId(null)
        setCategoryTouched(false)
        setMethod('equal')
        setInputs({})
        setParticipants(new Set(members.map((m) => m.id)))
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const amountNum = Number(amount)
  const amountValid = amount !== '' && !Number.isNaN(amountNum) && amountNum > 0

  /** Members included in the split for the current method. */
  const splitMembers = useMemo(
    () => (method === 'equal' ? members.filter((m) => participants.has(m.id)) : members),
    [method, members, participants],
  )

  /** Live preview of computed shares; null when input is incomplete/invalid. */
  const preview = useMemo(() => {
    if (!amountValid || splitMembers.length === 0) return null
    try {
      const shareInputs = splitMembers.map((m) => {
        const raw = Number(inputs[m.id] ?? 0)
        return method === 'exact'
          ? { memberId: m.id, exactCents: toCents(Number.isNaN(raw) ? 0 : raw) }
          : { memberId: m.id, weight: Number.isNaN(raw) ? 0 : raw }
      })
      return computeShares(toCents(amountNum), method, shareInputs)
    } catch (e) {
      if (e instanceof SplitValidationError) return e
      return null
    }
  }, [amountValid, amountNum, method, splitMembers, inputs])

  const previewError = preview instanceof SplitValidationError ? preview : null
  const previewShares = preview instanceof Map ? preview : null

  /** For 'exact': remaining amount still unassigned. */
  const exactRemaining = useMemo(() => {
    if (method !== 'exact' || !amountValid) return 0
    const assigned = splitMembers.reduce((s, m) => {
      const v = Number(inputs[m.id] ?? 0)
      return s + (Number.isNaN(v) ? 0 : toCents(v))
    }, 0)
    return fromCents(toCents(amountNum) - assigned)
  }, [method, amountValid, amountNum, splitMembers, inputs])

  function toggleParticipant(id: string) {
    setParticipants((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size === 1) return prev // keep at least one
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) { setFormError('Escribe una descripción'); return }
    if (!amountValid) { setFormError('Escribe un monto válido'); return }
    if (!paidBy) { setFormError('Elige quién pagó'); return }
    if (!previewShares) {
      setFormError(previewError?.message ?? 'Revisa la repartición')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        description: description.trim(),
        amount: amountNum,
        paidByMemberId: paidBy,
        method,
        inputs: splitMembers.map((m) => {
          const raw = Number(inputs[m.id] ?? 0)
          return method === 'exact'
            ? { memberId: m.id, exactAmount: Number.isNaN(raw) ? 0 : raw }
            : { memberId: m.id, weight: method === 'equal' ? undefined : (Number.isNaN(raw) ? 0 : raw) }
        }),
        accountId: linkAccount ? (accountId || null) : null,
        categoryId,
      })
      onClose()
    } catch {
      setFormError('No se pudo guardar el gasto')
    } finally {
      setSubmitting(false)
    }
  }

  const payerMember = members.find((m) => m.id === paidBy)
  const payerIsMe = payerMember ? memberIsMe(payerMember, user?.id) : false

  /** Typing the description auto-suggests a category until the user overrides it. */
  function handleDescription(value: string) {
    setDescription(value)
    if (!categoryTouched) {
      setCategoryId(guessCategory(value, pickableCategories)?.id ?? null)
    }
  }

  function pickCategory(id: string | null) {
    setCategoryTouched(true)
    setCategoryId((prev) => (prev === id ? null : id))
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar gasto' : 'Nuevo gasto compartido'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          label="Descripción"
          placeholder="Cena, súper, gasolina…"
          value={description}
          onChange={(e) => handleDescription(e.target.value)}
          autoFocus
        />

        <Input
          label="Monto total"
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0.01"
          step="any"
        />

        <Select label="Pagó" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>

        {/* Category — auto-suggested from the description, tap to override/clear */}
        {pickableCategories.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-text">Categoría</p>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {pickableCategories.map((c) => {
                const active = c.id === categoryId
                const color = categoryColor(c)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pickCategory(c.id)}
                    className={clsx(
                      'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition-all active:scale-95',
                      active
                        ? 'border-transparent text-white'
                        : 'border-border bg-bg-elevated text-text-secondary hover:border-border-strong',
                    )}
                    style={active ? { background: color } : undefined}
                  >
                    {createElement(categoryIcon(c), { size: 14, stroke: 2 })}
                    {c.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Split method segmented pill */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-text">Repartición</p>
          <div className="grid grid-cols-4 rounded-full bg-bg-secondary p-1">
            {(Object.keys(METHOD_LABELS) as SplitMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMethod(m); setInputs({}) }}
                className={clsx(
                  'rounded-full py-2 text-[12px] font-extrabold transition-all',
                  method === m
                    ? 'bg-bg-elevated text-text shadow-[0_2px_6px_rgba(26,31,54,0.06)]'
                    : 'text-text-secondary',
                )}
              >
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {/* Per-member rows */}
        <div className="flex flex-col gap-1.5">
          {members.map((m) => {
            const included = method !== 'equal' || participants.has(m.id)
            const shareCents = previewShares?.get(m.id)
            return (
              <div
                key={m.id}
                className={clsx(
                  'flex items-center gap-2 rounded-xl px-3 py-2 transition-colors',
                  included ? 'bg-bg-secondary/60' : 'bg-bg-secondary/25 opacity-55',
                )}
              >
                {method === 'equal' ? (
                  <button
                    type="button"
                    onClick={() => toggleParticipant(m.id)}
                    className={clsx(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                      included ? 'border-primary bg-primary text-white' : 'border-border bg-bg-elevated',
                    )}
                    aria-label={included ? `Quitar a ${m.name}` : `Incluir a ${m.name}`}
                  >
                    {included && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ) : null}
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text">
                  {m.name}
                </span>
                {method !== 'equal' && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={inputs[m.id] ?? ''}
                      onChange={(e) => setInputs((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      placeholder="0"
                      min="0"
                      step="any"
                      className="h-9 w-20 rounded-lg border border-border bg-bg-elevated px-2 text-right text-[13px] font-semibold text-text focus-visible:border-primary focus-visible:outline-none"
                    />
                    <span className="w-4 text-[11px] font-bold text-text-tertiary">
                      {method === 'percentage' ? '%' : method === 'exact' ? '$' : '×'}
                    </span>
                  </div>
                )}
                {included && shareCents != null && (
                  <span className="shrink-0 font-mono text-[12px] font-bold text-primary-deep">
                    {formatMXN(fromCents(shareCents))}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Live validation feedback */}
        {method === 'exact' && amountValid && exactRemaining !== 0 && (
          <p className={clsx('text-[12px] font-semibold', exactRemaining > 0 ? 'text-text-secondary' : 'text-debt')}>
            {exactRemaining > 0
              ? `Falta asignar ${formatMXN(exactRemaining)}`
              : `Te pasaste por ${formatMXN(Math.abs(exactRemaining))}`}
          </p>
        )}
        {method === 'percentage' && previewError && (
          <p className="text-[12px] font-semibold text-text-secondary">{previewError.message}</p>
        )}

        {payerIsMe && !isEdit && (
          <AccountLinkField
            accounts={accounts}
            linked={linkAccount}
            accountId={accountId}
            onToggle={(next, defaultId) => { setLinkAccount(next); setAccountId(defaultId) }}
            onAccountChange={setAccountId}
            label="Registrar el gasto en mi cuenta"
          />
        )}
        {isEdit && (
          <p className="text-[11px] leading-snug text-text-tertiary">
            Editar no modifica movimientos ya registrados en cuentas.
          </p>
        )}

        {formError && <p className="text-xs text-debt">• {formError}</p>}

        <Button type="submit" loading={submitting} disabled={!previewShares} className="mt-1">
          {isEdit ? 'Guardar cambios' : 'Registrar gasto'}
        </Button>
      </form>
    </Modal>
  )
}
