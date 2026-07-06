import { useEffect, useState } from 'react'
import { useAccounts } from '@/hooks/useAccounts'
import { loanRemaining } from '@/hooks/useLoans'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { AccountLinkField } from '@/components/split/AccountLinkField'
import { formatMXN } from '@/lib/format'
import type { Loan, LoanPayment } from '@/types'

/* Shared loan action modals (abono / mark paid), extracted from
 * MisPrestamos so the group detail can offer the same actions on the
 * legacy loans of a direct group. */

export function AbonoModal({
  open,
  loan,
  payments,
  onClose,
  onSubmit,
}: {
  open: boolean
  loan: Loan
  payments: LoanPayment[]
  onClose: () => void
  onSubmit: (
    amount: number,
    opts?: { accountId?: string | null; note?: string | null },
  ) => Promise<void>
}) {
  const { data: accounts } = useAccounts()
  const remaining = loanRemaining(loan, payments)

  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [linkAccount, setLinkAccount] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmount('')
      setNote('')
      setLinkAccount(false)
      setAccountId('')
      setFormError('')
    }
  }, [open])

  const amountNum = Number(amount)
  const afterAbono = Math.max(0, remaining - (amountNum > 0 ? amountNum : 0))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || Number.isNaN(amountNum) || amountNum <= 0) {
      setFormError('Escribe un monto válido')
      return
    }
    if (amountNum > remaining) {
      setFormError(`El monto no puede superar el saldo pendiente (${formatMXN(remaining)})`)
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(amountNum, {
        accountId: linkAccount ? (accountId || null) : null,
        note: note.trim() || null,
      })
    } catch {
      setFormError('No se pudo registrar el abono')
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Abono · ${loan.name}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="rounded-xl bg-bg-secondary px-3.5 py-2.5">
          <p className="text-[11px] text-text-tertiary">Saldo pendiente</p>
          <p className="text-base font-bold text-text">{formatMXN(remaining)}</p>
        </div>

        <Input
          label="Monto del abono"
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
          min="0.01"
          step="any"
        />

        {amountNum > 0 && amountNum <= remaining && (
          <div className="rounded-xl bg-primary/5 px-3.5 py-2">
            <p className="text-[12px] text-primary-deep">
              Quedará pendiente: <strong>{formatMXN(afterAbono)}</strong>
            </p>
          </div>
        )}

        <Input
          label="Nota (opcional)"
          placeholder="Transferencia del 1 ene…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <AccountLinkField
          accounts={accounts}
          linked={linkAccount}
          accountId={accountId}
          onToggle={(next, defaultId) => { setLinkAccount(next); setAccountId(defaultId) }}
          onAccountChange={setAccountId}
        />

        {formError && <p className="text-xs text-debt">• {formError}</p>}

        <Button type="submit" loading={submitting} className="mt-1">
          Registrar abono
        </Button>
      </form>
    </Modal>
  )
}

export function MarkPaidModal({
  open,
  loan,
  payments,
  onClose,
  onSubmit,
}: {
  open: boolean
  loan: Loan
  payments: LoanPayment[]
  onClose: () => void
  onSubmit: (opts?: { accountId?: string | null; amount?: number }) => Promise<void>
}) {
  const { data: accounts } = useAccounts()
  const remaining = loanRemaining(loan, payments)

  const [amount, setAmount] = useState('')
  const [linkAccount, setLinkAccount] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmount(String(remaining))
      setLinkAccount(false)
      setAccountId('')
      setFormError('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = Number(amount)
    if (linkAccount && (!amount || Number.isNaN(num) || num <= 0)) {
      setFormError('Escribe un monto válido')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        accountId: linkAccount ? (accountId || null) : null,
        amount: linkAccount ? num : undefined,
      })
    } catch {
      setFormError('No se pudo saldar el préstamo')
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Saldar · ${loan.name}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="rounded-xl bg-bg-secondary px-3.5 py-2.5">
          <p className="text-[11px] text-text-tertiary">Saldo pendiente</p>
          <p className="text-base font-bold text-text">{formatMXN(remaining)}</p>
        </div>

        <AccountLinkField
          accounts={accounts}
          linked={linkAccount}
          accountId={accountId}
          onToggle={(next, defaultId) => { setLinkAccount(next); setAccountId(defaultId) }}
          onAccountChange={setAccountId}
        />

        {linkAccount && (
          <Input
            label="Monto a registrar"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0.01"
            step="any"
          />
        )}

        <div className="rounded-xl bg-asset/10 px-3.5 py-2.5">
          <p className="text-[12px] font-medium text-asset-deep">
            El préstamo quedará marcado como saldado
          </p>
        </div>

        {formError && <p className="text-xs text-debt">• {formError}</p>}

        <Button type="submit" loading={submitting} className="mt-1">
          Confirmar
        </Button>
      </form>
    </Modal>
  )
}
