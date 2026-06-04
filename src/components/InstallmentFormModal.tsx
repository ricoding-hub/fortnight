import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { IconCalendarEvent } from '@tabler/icons-react'
import { Modal } from '@/components/ui/Modal'
import { useAccounts } from '@/hooks/useAccounts'
import type { NewInstallment } from '@/hooks/useInstallments'

const isMoney = (v: string) => v !== '' && !Number.isNaN(Number(v)) && Number(v) > 0
const isMonths = (v: string) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 120
}

const schema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  total_amount: z.string().refine(isMoney, 'Monto inválido'),
  months_total: z.string().refine(isMonths, 'Entre 1 y 120 meses'),
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

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { months_total: '12' },
  })

  useEffect(() => {
    if (open) reset({ months_total: '12' })
  }, [open, reset])

  const totalAmountStr = watch('total_amount')
  const monthsTotalStr = watch('months_total')
  const totalAmount = Number(totalAmountStr)
  const monthsTotal = Number(monthsTotalStr)
  const monthlyAmount = totalAmount > 0 && monthsTotal > 0
    ? Math.round((totalAmount / monthsTotal) * 100) / 100
    : 0

  async function handleFormSubmit(values: FormValues) {
    await onSubmit({
      name: values.name,
      total_amount: Number(values.total_amount),
      monthly_amount: monthlyAmount,
      months_total: Number(values.months_total),
      account_id: values.account_id || null,
      start_date: values.start_date || undefined,
    })
    onClose()
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

        {/* Monthly preview */}
        {monthlyAmount > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-primary-soft/30 px-3.5 py-2.5">
            <IconCalendarEvent size={15} className="text-primary-deep" />
            <span className="text-[12.5px] font-bold text-primary-deep">
              ${monthlyAmount.toLocaleString()}/mes durante {monthsTotal} meses
            </span>
          </div>
        )}

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
