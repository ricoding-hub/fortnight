import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useAccounts } from '@/hooks/useAccounts'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { AccountLinkField } from '@/components/split/AccountLinkField'
import { formatMXN } from '@/lib/format'
import { memberIsMe, type NewSettlement } from '@/hooks/useSplitGroups'
import type { SplitMember } from '@/types'

interface SettleModalProps {
  open: boolean
  onClose: () => void
  from: SplitMember
  to: SplitMember
  /** Suggested amount in pesos (from debt simplification). */
  suggestedAmount: number
  onSubmit: (s: NewSettlement) => Promise<void>
}

export function SettleModal({ open, onClose, from, to, suggestedAmount, onSubmit }: SettleModalProps) {
  const { user } = useAuth()
  const { data: accounts } = useAccounts()
  // memberIsMe (not is_me): joined members have is_me=false — using is_me
  // hid the account field from every non-owner member.
  const involvesMe = memberIsMe(from, user?.id) || memberIsMe(to, user?.id)

  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [linkAccount, setLinkAccount] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmount(suggestedAmount > 0 ? String(suggestedAmount) : '')
      setNote('')
      setLinkAccount(false)
      setAccountId('')
      setFormError('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = Number(amount)
    if (!amount || Number.isNaN(num) || num <= 0) {
      setFormError('Escribe un monto válido')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        fromMemberId: from.id,
        toMemberId: to.id,
        amount: num,
        accountId: involvesMe && linkAccount ? (accountId || null) : null,
        note: note.trim() || null,
      })
      onClose()
    } catch {
      setFormError('No se pudo registrar la liquidación')
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Liquidar">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="rounded-xl bg-bg-secondary px-3.5 py-2.5">
          <p className="text-[11px] text-text-tertiary">Pago sugerido</p>
          <p className="text-base font-bold text-text">
            {from.name} → {to.name}
            {suggestedAmount > 0 && <span className="ml-1.5">· {formatMXN(suggestedAmount)}</span>}
          </p>
        </div>

        <Input
          label="Monto"
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0.01"
          step="any"
        />

        <Input
          label="Nota (opcional)"
          placeholder="Transferencia, efectivo…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {involvesMe && (
          <AccountLinkField
            accounts={accounts}
            linked={linkAccount}
            accountId={accountId}
            onToggle={(next, defaultId) => { setLinkAccount(next); setAccountId(defaultId) }}
            onAccountChange={setAccountId}
          />
        )}

        <div className="rounded-xl bg-asset/10 px-3.5 py-2.5">
          <p className="text-[12px] font-medium text-asset-deep">
            {involvesMe
              ? 'Si hay préstamos abiertos con esta persona, el pago los abona primero.'
              : 'Se registrará el pago entre estas dos personas dentro del grupo.'}
          </p>
        </div>

        {formError && <p className="text-xs text-debt">• {formError}</p>}

        <Button type="submit" loading={submitting} className="mt-1">
          Confirmar liquidación
        </Button>
      </form>
    </Modal>
  )
}
