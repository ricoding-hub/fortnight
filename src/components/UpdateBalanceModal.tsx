import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/hooks/useToast'
import { formatMXN } from '@/lib/format'
import type { Account } from '@/types'

interface UpdateBalanceModalProps {
  open: boolean
  onClose: () => void
  accounts: Account[]
  onSaveBalance: (account: Account, newBalance: number) => Promise<void>
}

export function UpdateBalanceModal({
  open,
  onClose,
  accounts,
  onSaveBalance,
}: UpdateBalanceModalProps) {
  const toast = useToast()
  const [accountId, setAccountId] = useState('')
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Reset form when opened or accounts change
  useEffect(() => {
    if (open) {
      const initialAccount = accounts[0]?.id ?? ''
      setAccountId(initialAccount)
      const acc = accounts.find((a) => a.id === initialAccount)
      setValue(acc ? String(acc.balance) : '')
      setError('')
    }
  }, [open, accounts])

  function handleAccountChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    setAccountId(id)
    const acc = accounts.find((a) => a.id === id)
    setValue(acc ? String(acc.balance) : '')
  }

  function close() {
    setError('')
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const next = Number(value)
    if (value.trim() === '' || Number.isNaN(next) || next < 0) {
      setError('Monto inválido')
      return
    }

    const account = accounts.find((a) => a.id === accountId)
    if (!account) return

    setSubmitting(true)
    setError('')
    try {
      await onSaveBalance(account, next)
      toast.success('Saldo actualizado', `El nuevo saldo de ${account.name} es ${formatMXN(next)}`)
      close()
    } catch {
      setError('No se pudo actualizar el saldo')
      toast.error('Error', 'No se pudo actualizar el saldo')
    } finally {
      setSubmitting(false)
    }
  }

  if (accounts.length === 0) {
    return (
      <Modal open={open} title="Actualizar saldo" onClose={onClose}>
        <p className="text-sm text-text-secondary">
          No tienes cuentas registradas.
        </p>
      </Modal>
    )
  }

  return (
    <Modal open={open} title="Actualizar saldo" onClose={close}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Select
          label="Cuenta"
          value={accountId}
          onChange={handleAccountChange}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>

        <Input
          label="Nuevo Saldo"
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />

        {error && (
          <p className="text-xs text-debt">
            <span aria-hidden="true">•</span> {error}
          </p>
        )}

        <Button type="submit" loading={submitting} className="mt-1">
          Guardar saldo
        </Button>
      </form>
    </Modal>
  )
}
