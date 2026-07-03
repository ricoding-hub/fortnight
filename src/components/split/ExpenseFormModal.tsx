import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { useAccounts } from '@/hooks/useAccounts'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { AccountLinkField } from '@/components/split/AccountLinkField'
import { computeShares, fromCents, toCents, SplitValidationError } from '@/lib/split'
import { formatMXN } from '@/lib/format'
import type { NewExpense } from '@/hooks/useSplitGroups'
import type { SplitMember, SplitMethod } from '@/types'

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
  onSubmit: (expense: NewExpense) => Promise<void>
}

export function ExpenseFormModal({ open, onClose, members, onSubmit }: ExpenseFormModalProps) {
  const { data: accounts } = useAccounts()

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [method, setMethod] = useState<SplitMethod>('equal')
  /** memberId → raw input (pct / parts / exact pesos, per method). */
  const [inputs, setInputs] = useState<Record<string, string>>({})
  /** memberIds participating in the split (equal method). */
  const [participants, setParticipants] = useState<Set<string>>(new Set())
  const [linkAccount, setLinkAccount] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const me = members.find((m) => m.is_me)

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDescription('')
      setAmount('')
      setPaidBy(me?.id ?? members[0]?.id ?? '')
      setMethod('equal')
      setInputs({})
      setParticipants(new Set(members.map((m) => m.id)))
      setLinkAccount(false)
      setAccountId('')
      setFormError('')
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
      })
      onClose()
    } catch {
      setFormError('No se pudo guardar el gasto')
    } finally {
      setSubmitting(false)
    }
  }

  const payerIsMe = members.find((m) => m.id === paidBy)?.is_me ?? false

  return (
    <Modal open={open} onClose={onClose} title="Nuevo gasto compartido">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          label="Descripción"
          placeholder="Cena, súper, gasolina…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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

        {payerIsMe && (
          <AccountLinkField
            accounts={accounts}
            linked={linkAccount}
            accountId={accountId}
            onToggle={(next, defaultId) => { setLinkAccount(next); setAccountId(defaultId) }}
            onAccountChange={setAccountId}
            label="Registrar el gasto en mi cuenta"
          />
        )}

        {formError && <p className="text-xs text-debt">• {formError}</p>}

        <Button type="submit" loading={submitting} disabled={!previewShares} className="mt-1">
          Registrar gasto
        </Button>
      </form>
    </Modal>
  )
}
