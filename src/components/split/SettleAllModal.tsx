import { useEffect, useState } from 'react'
import { useAccounts } from '@/hooks/useAccounts'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { AccountLinkField } from '@/components/split/AccountLinkField'
import { formatMXN } from '@/lib/format'

export interface SettleAllBreakdownLine {
  label: string
  amount: number
}

interface SettleAllModalProps {
  open: boolean
  onClose: () => void
  contactName: string
  /** Combined net: > 0 they pay me, < 0 I pay them. */
  net: number
  /** Open loans / split net lines shown for transparency. */
  breakdown: SettleAllBreakdownLine[]
  onConfirm: (opts: { accountId?: string | null; note?: string | null }) => Promise<void>
}

/** One-tap settlement of EVERYTHING pending with a person. */
export function SettleAllModal({
  open,
  onClose,
  contactName,
  net,
  breakdown,
  onConfirm,
}: SettleAllModalProps) {
  const { data: accounts } = useAccounts()
  const [note, setNote] = useState('')
  const [linkAccount, setLinkAccount] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNote('')
      setLinkAccount(false)
      setAccountId('')
      setFormError('')
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onConfirm({
        accountId: linkAccount ? (accountId || null) : null,
        note: note.trim() || null,
      })
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo saldar. Inténtalo de nuevo.')
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Saldar todo · ${contactName}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="rounded-xl bg-bg-secondary px-3.5 py-2.5">
          <p className="text-[11px] text-text-tertiary">
            {net > 0 ? `${contactName} te paga` : `Le pagas a ${contactName}`}
          </p>
          <p className="text-lg font-bold tabular-nums text-text">{formatMXN(Math.abs(net))}</p>
        </div>

        {breakdown.length > 0 && (
          <div className="rounded-xl border border-border px-3.5 py-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-text-tertiary">
              Desglose
            </p>
            <ul className="divide-y divide-border">
              {breakdown.map((line, i) => (
                <li key={i} className="flex items-baseline justify-between gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary">
                    {line.label}
                  </span>
                  <span className="font-mono text-[12px] font-bold tabular-nums text-text">
                    {formatMXN(line.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Input
          label="Nota (opcional)"
          placeholder="Transferencia, efectivo…"
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

        <div className="rounded-xl bg-asset/10 px-3.5 py-2.5">
          <p className="text-[12px] font-medium text-asset-deep">
            Se abonan primero los préstamos abiertos (del más viejo al más nuevo) y el
            resto se registra como liquidación. Todo queda en el historial.
          </p>
        </div>

        {formError && <p className="text-xs text-debt">• {formError}</p>}

        <Button type="submit" loading={submitting} className="mt-1">
          Saldar {formatMXN(Math.abs(net))}
        </Button>
      </form>
    </Modal>
  )
}
