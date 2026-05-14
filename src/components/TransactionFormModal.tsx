import { useState, useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import clsx from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/hooks/useToast'
import { KIND_LABEL, KIND_ORDER } from '@/lib/categories'
import type { Account, Category } from '@/types'
import type { NewTransaction } from '@/hooks/useTransactions'

interface TransactionFormModalProps {
  open: boolean
  onClose: () => void
  accounts: Account[]
  categories: Category[]
  onCreate: (tx: NewTransaction) => Promise<void>
  initialDirection?: Direction
}

/** Money out of pocket vs. money received. The sign depends on account type. */
export type Direction = 'spend' | 'receive'

const today = () => new Date().toISOString().slice(0, 10)

const txSchema = z.object({
  amount: z
    .string()
    .refine(
      (v) => v !== '' && !Number.isNaN(Number(v)) && Number(v) > 0,
      'Escribe un monto mayor a 0',
    ),
  account_id: z.string().min(1, 'Elige una cuenta'),
  category_id: z.string(),
  description: z.string(),
  date: z.string().min(1, 'Elige una fecha'),
})

type TxFormValues = z.infer<typeof txSchema>

export function TransactionFormModal({
  open,
  onClose,
  accounts,
  categories,
  onCreate,
  initialDirection = 'spend',
}: TransactionFormModalProps) {
  const toast = useToast()
  const [direction, setDirection] = useState<Direction>(initialDirection)

  // Sync direction when opened
  useEffect(() => {
    if (open) {
      setDirection(initialDirection)
    }
  }, [open, initialDirection])
  const [submitError, setSubmitError] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TxFormValues>({
    resolver: zodResolver(txSchema),
    defaultValues: {
      amount: '',
      account_id: accounts[0]?.id ?? '',
      category_id: '',
      description: '',
      date: today(),
    },
  })

  const accountId = useWatch({ control, name: 'account_id' })
  const selectedAccount = accounts.find((a) => a.id === accountId)
  const isCredit = selectedAccount?.type === 'credit'

  // Labels adapt to the account: a credit card spends as a "Compra", a debit
  // account as a "Gasto". Money received is a "Pago" to the card or an "Ingreso".
  const labels: Record<Direction, string> = isCredit
    ? { spend: 'Compra', receive: 'Pago' }
    : { spend: 'Gasto', receive: 'Ingreso' }

  function close() {
    reset()
    setDirection('spend')
    setSubmitError(false)
    onClose()
  }

  async function onSubmit(values: TxFormValues) {
    setSubmitError(false)
    const magnitude = Math.abs(Number(values.amount))
    // Debit: spend lowers the balance. Credit: spend raises the debt.
    const sign =
      direction === 'spend' ? (isCredit ? 1 : -1) : isCredit ? -1 : 1
    try {
      await onCreate({
        account_id: values.account_id,
        amount: sign * magnitude,
        category_id: values.category_id || null,
        description: values.description.trim() || null,
        date: values.date,
      })
      toast.success('Movimiento guardado', 'El movimiento se registró correctamente')
      close()
    } catch {
      setSubmitError(true)
      toast.error('Error al guardar', 'Ocurrió un problema al guardar el movimiento')
    }
  }

  if (accounts.length === 0) {
    return (
      <Modal open={open} title="Nuevo movimiento" onClose={onClose}>
        <p className="text-sm text-text-secondary">
          Primero crea una cuenta en la pestaña Cuentas.
        </p>
      </Modal>
    )
  }

  return (
    <Modal open={open} title="Nuevo movimiento" onClose={close}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        {/* Direction toggle */}
        <div className="flex rounded-xl bg-bg-secondary p-1">
          {(['spend', 'receive'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={clsx(
                'h-10 flex-1 rounded-lg text-sm font-semibold transition-all duration-[--duration-fast]',
                direction === d
                  ? d === 'spend'
                    ? 'bg-debt text-white shadow-sm'
                    : 'bg-asset text-white shadow-sm'
                  : 'text-text-secondary hover:text-text',
              )}
            >
              {labels[d]}
            </button>
          ))}
        </div>

        <Input
          label="Monto"
          inputMode="decimal"
          placeholder="0"
          autoFocus
          error={errors.amount?.message}
          {...register('amount')}
        />

        <Select
          label="Cuenta"
          error={errors.account_id?.message}
          {...register('account_id')}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>

        <Select label="Categoría" {...register('category_id')}>
          <option value="">Sin categoría</option>
          {KIND_ORDER.map((kind) => {
            const inKind = categories.filter((c) => c.kind === kind)
            if (inKind.length === 0) return null
            return (
              <optgroup key={kind} label={KIND_LABEL[kind]}>
                {inKind.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )
          })}
        </Select>

        <Input
          label="Descripción"
          placeholder="Opcional"
          {...register('description')}
        />

        <Input
          label="Fecha"
          type="date"
          error={errors.date?.message}
          {...register('date')}
        />

        {submitError && (
          <p className="text-xs text-debt">
            <span aria-hidden="true">•</span> No se pudo guardar. Intenta de nuevo.
          </p>
        )}

        <Button type="submit" loading={isSubmitting} className="mt-1">
          Guardar movimiento
        </Button>
      </form>
    </Modal>
  )
}
