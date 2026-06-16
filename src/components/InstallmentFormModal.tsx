import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { IconCalendarEvent } from '@tabler/icons-react'
import clsx from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { useAccounts } from '@/hooks/useAccounts'
import { useToast } from '@/hooks/useToast'
import type { NewInstallment } from '@/hooks/useInstallments'

const isMoney = (v: string) => v !== '' && !Number.isNaN(Number(v)) && Number(v) > 0
const isMonths = (v: string) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 120
}
const isPaidMonths = (v: string) => {
  const n = Number(v)
  return v === '' || (Number.isInteger(n) && n >= 0 && n <= 120)
}

const schema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  total_amount: z.string().refine(isMoney, 'Monto inválido'),
  months_total: z.string().refine(isMonths, 'Entre 1 y 120 meses'),
  months_paid: z.string().refine(isPaidMonths, 'Número inválido'),
  is_zero_interest: z.boolean(),
  account_id: z.string().optional(),
  start_date: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface InstallmentFormModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: NewInstallment) => Promise<void>
}

export function InstallmentFormModal({ open, onClose, onSubmit }: InstallmentFormModalProps) {
  const { data: accounts } = useAccounts()
  const creditAccounts = accounts.filter((a) => a.type === 'credit')
  const toast = useToast()
  const [saveError, setSaveError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { months_total: '12', months_paid: '0', is_zero_interest: true },
  })

  useEffect(() => {
    if (open) {
      reset({ months_total: '12', months_paid: '0', is_zero_interest: true })
      setSaveError(null)
    }
  }, [open, reset])

  const totalAmountStr = watch('total_amount')
  const monthsTotalStr = watch('months_total')
  const monthsPaidStr = watch('months_paid')
  const isZeroInterest = watch('is_zero_interest')
  const totalAmount = Number(totalAmountStr)
  const monthsTotal = Number(monthsTotalStr)
  const monthsPaid = Number(monthsPaidStr) || 0
  const monthlyAmount =
    totalAmount > 0 && monthsTotal > 0
      ? Math.round((totalAmount / monthsTotal) * 100) / 100
      : 0

  async function handleFormSubmit(values: FormValues) {
    setSaveError(null)
    try {
      await onSubmit({
        name: values.name,
        total_amount: Number(values.total_amount),
        monthly_amount: monthlyAmount,
        months_total: Number(values.months_total),
        months_paid: Number(values.months_paid) || 0,
        is_zero_interest: values.is_zero_interest,
        account_id: values.account_id || null,
        start_date: values.start_date || undefined,
      })
      toast.success('Gasto registrado', `${values.name} — ${monthlyAmount.toLocaleString()}/mes`)
      onClose()
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message ?? 'Error desconocido'
      setSaveError(msg)
      toast.error('Error al guardar', msg)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo gasto a meses">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col gap-4">
        {/* Name */}
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold text-text-secondary">
            Nombre del gasto
          </label>
          <input
            {...register('name')}
            placeholder="Ej. iPhone 16, Laptop, Mueble..."
            className="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-[13px] text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {errors.name && (
            <p className="mt-1 text-[11px] text-debt">{errors.name.message}</p>
          )}
        </div>

        {/* Total amount + months */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-text-secondary">
              Monto total
            </label>
            <input
              {...register('total_amount')}
              type="number"
              inputMode="decimal"
              placeholder="0"
              className="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-[13px] text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errors.total_amount && (
              <p className="mt-1 text-[11px] text-debt">{errors.total_amount.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-text-secondary">
              Meses
            </label>
            <input
              {...register('months_total')}
              type="number"
              inputMode="numeric"
              placeholder="12"
              className="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-[13px] text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errors.months_total && (
              <p className="mt-1 text-[11px] text-debt">{errors.months_total.message}</p>
            )}
          </div>
        </div>

        {/* Pagos ya hechos */}
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold text-text-secondary">
            Pagos ya hechos
          </label>
          <input
            {...register('months_paid')}
            type="number"
            inputMode="numeric"
            placeholder="0"
            className="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-[13px] text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {monthsPaid > 0 && monthsTotal > 0 && monthsPaid < monthsTotal && (
            <p className="mt-1 text-[11px] text-text-tertiary">
              Quedan {monthsTotal - monthsPaid} meses por pagar
            </p>
          )}
          {errors.months_paid && (
            <p className="mt-1 text-[11px] text-debt">{errors.months_paid.message}</p>
          )}
        </div>

        {/* Monthly preview */}
        {monthlyAmount > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-primary-soft/30 px-3.5 py-2.5">
            <IconCalendarEvent size={15} className="text-primary-deep" />
            <span className="text-[12.5px] font-bold text-primary-deep">
              ${monthlyAmount.toLocaleString()}/mes durante {monthsTotal} meses
            </span>
          </div>
        )}

        {/* ¿Sin interés? toggle */}
        <Controller
          control={control}
          name="is_zero_interest"
          render={({ field }) => (
            <div>
              <p className="mb-1.5 text-[12.5px] font-semibold text-text-secondary">Tipo de plan</p>
              <div className="flex overflow-hidden rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => field.onChange(true)}
                  className={clsx(
                    'flex-1 py-2.5 text-[12.5px] font-bold transition-colors',
                    isZeroInterest
                      ? 'bg-primary text-white'
                      : 'bg-bg text-text-secondary hover:bg-primary/5',
                  )}
                >
                  MSI 0% (sin interés)
                </button>
                <button
                  type="button"
                  onClick={() => field.onChange(false)}
                  className={clsx(
                    'flex-1 py-2.5 text-[12.5px] font-bold transition-colors',
                    !isZeroInterest
                      ? 'bg-debt text-white'
                      : 'bg-bg text-text-secondary hover:bg-debt/5',
                  )}
                >
                  Con interés
                </button>
              </div>
            </div>
          )}
        />

        {/* Account picker */}
        {creditAccounts.length > 0 && (
          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-text-secondary">
              Tarjeta asociada (opcional)
            </label>
            <select
              {...register('account_id')}
              className="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-[13px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Sin asociar</option>
              {creditAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Start date */}
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold text-text-secondary">
            Fecha de inicio
          </label>
          <input
            {...register('start_date')}
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-[13px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {saveError && (
          <p className="rounded-xl bg-debt/8 px-3.5 py-2.5 text-[12px] font-semibold text-debt">
            {saveError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 rounded-xl bg-primary py-3 text-[13.5px] font-extrabold text-white transition-opacity disabled:opacity-60"
        >
          {isSubmitting ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </Modal>
  )
}
