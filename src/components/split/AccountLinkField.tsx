import clsx from 'clsx'
import { Select } from '@/components/ui/Select'
import type { Account } from '@/types'

interface AccountLinkFieldProps {
  accounts: Account[]
  linked: boolean
  accountId: string
  onToggle: (linked: boolean, defaultAccountId: string) => void
  onAccountChange: (id: string) => void
  label?: string
}

/**
 * "Registrar en cuenta" switch + account selector. Extracted from the
 * duplicated blocks in AbonoModal / MarkPaidModal so every settle-like
 * flow (abono, saldar, gasto compartido, liquidación) shares one control.
 */
export function AccountLinkField({
  accounts,
  linked,
  accountId,
  onToggle,
  onAccountChange,
  label = 'Registrar en cuenta',
}: AccountLinkFieldProps) {
  function toggle() {
    const next = !linked
    onToggle(next, !accountId && accounts.length > 0 ? accounts[0].id : accountId)
  }

  return (
    <>
      <label className="flex cursor-pointer items-center gap-3">
        <div
          role="switch"
          aria-checked={linked}
          tabIndex={0}
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault()
              toggle()
            }
          }}
          className={clsx(
            'relative h-5 w-9 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            linked ? 'bg-primary' : 'bg-border',
          )}
        >
          <div
            className={clsx(
              'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
              linked ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </div>
        <span className="text-sm font-medium text-text">{label}</span>
      </label>

      {linked && accounts.length > 0 && (
        <Select
          label="Cuenta"
          value={accountId}
          onChange={(e) => onAccountChange(e.target.value)}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      )}
    </>
  )
}
