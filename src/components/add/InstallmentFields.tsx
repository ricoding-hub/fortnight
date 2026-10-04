import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { IconCalendarEvent, IconChevronDown } from '@tabler/icons-react'
import clsx from 'clsx'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Segmented } from '@/components/ui/Segmented'
import { FooterPortal } from '@/components/add/FooterPortal'
import { useToast } from '@/hooks/useToast'
import { toKey } from '@/lib/calendar'
import { formatMXN } from '@/lib/format'
import { isCountInput, isMoneyInput, moneyOr, parseCountInput } from '@/lib/money'
import type { InstallmentPatch, NewInstallment } from '@/hooks/useInstallments'
import type { Account, Installment } from '@/types'

const schema = z
  .object({
    name: z.string().trim().min(1, 'Escribe qué compraste'),
    total_amount: z.string().refine((v) => isMoneyInput(v), 'Escribe un monto, por ejemplo 574.50'),
    months_total: z.string().refine((v) => isCountInput(v, 1, 120), 'Entre 1 y 120 meses'),
    months_paid: z.string().refine((v) => v === '' || isCountInput(v, 0, 120), 'Número inválido'),
    is_zero_interest: z.boolean(),
    charge_to_card: z.boolean(),
    account_id: z.string().optional(),
    start_date: z.string().optional(),
  })
  // Nada impedía "20 de 12 pagados". Hacía negativo getInstallmentRemaining y,
  // desde v1.7.0, ese negativo es lo que se carga a la tarjeta: el saldo BAJARÍA
  // al registrar una compra.
  .refine(
    (v) => {
      const paid = parseCountInput(v.months_paid === '' ? '0' : v.months_paid)
      const total = parseCountInput(v.months_total)
      return paid == null || total == null || paid <= total
    },
    { message: 'No puedes llevar más pagos que meses', path: ['months_paid'] },
  )

type FormValues = z.infer<typeof schema>

/** Plazos que ofrecen las tiendas. Un select, no un campo numérico. */
const PLAZOS = [3, 6, 9, 12, 15, 18, 24] as const

interface InstallmentFieldsProps {
  /** `id` del <form>, para asociar el botón del pie. */
  formId: string
  accounts: Account[]
  /** Contenedor del pie fijo donde va el botón. Sin él, el botón va en línea. */
  footerTarget?: HTMLElement | null
  editingInstallment?: Installment
  onSubmit: (data: NewInstallment) => Promise<void>
  onUpdate?: (id: string, patch: InstallmentPatch) => Promise<void>
  /** Tras guardar: cerrar el modal o la hoja. */
  onDone: () => void
}

/**
 * Los campos de una compra a meses.
 *
 * Salen de `InstallmentFormModal` para que la misma lógica — la validación, el
 * "¿ya está en el saldo?", la vista previa — sirva en el modal de editar un plan
 * y en la hoja «Agregar», en lugar de existir dos veces y divergir.
 *
 * Lo común queda a la vista (qué, cuánto, cuántos meses, tarjeta, si ya está en
 * el saldo). «Pagos ya hechos», el tipo de plan y la fecha de inicio van en
 * «Más opciones», cerrado por defecto: el caso normal es registrar algo que
 * acabas de comprar.
 */
export function InstallmentFields({
  formId,
  accounts,
  footerTarget,
  editingInstallment,
  onSubmit,
  onUpdate,
  onDone,
}: InstallmentFieldsProps) {
  const isEditing = editingInstallment != null
  const creditAccounts = accounts.filter((a) => a.type === 'credit')
  const toast = useToast()
  const [saveError, setSaveError] = useState<string | null>(null)
  // Editar quiere ver todo; registrar algo nuevo, lo mínimo.
  const [masOpciones, setMasOpciones] = useState(isEditing)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    // Cargar es lo normal: registrar una compra que acabas de hacer sube la
    // deuda de la tarjeta, que es lo que de verdad pasó.
    defaultValues: editingInstallment
      ? {
          name: editingInstallment.name,
          total_amount: String(editingInstallment.total_amount),
          months_total: String(editingInstallment.months_total),
          months_paid: String(editingInstallment.months_paid),
          is_zero_interest: editingInstallment.is_zero_interest,
          account_id: editingInstallment.account_id ?? '',
          start_date: editingInstallment.start_date,
          charge_to_card: false,
        }
      : {
          name: '',
          total_amount: '',
          months_total: '12',
          months_paid: '0',
          is_zero_interest: true,
          charge_to_card: true,
          account_id: '',
          start_date: toKey(new Date()),
        },
  })

  const totalAmountStr = watch('total_amount')
  const monthsTotalStr = watch('months_total')
  const monthsPaidStr = watch('months_paid')
  const isZeroInterest = watch('is_zero_interest')
  const chargeToCard = watch('charge_to_card')
  const accountId = watch('account_id')

  // `Number()` a secas convierte "574,5" en NaN, que vaciaba la vista previa en
  // silencio y habría escrito NaN en la fila al guardar.
  const totalAmount = moneyOr(totalAmountStr, 0)
  const monthsTotal = parseCountInput(monthsTotalStr ?? '') ?? 0
  const monthsPaid = parseCountInput(monthsPaidStr ?? '') ?? 0
  const monthlyAmount =
    totalAmount > 0 && monthsTotal > 0 ? Math.round((totalAmount / monthsTotal) * 100) / 100 : 0

  // Lo que el cargo pondría en la tarjeta: los meses que faltan, no el precio de
  // etiqueta. Registrar un plan con 11 de 18 pagados mueve los siete que quedan.
  const selectedCard = creditAccounts.find((a) => a.id === accountId)
  const pendingPrincipal = Math.max(0, monthsTotal - monthsPaid) * monthlyAmount
  const balanceAfter = selectedCard ? Number(selectedCard.balance) + pendingPrincipal : 0

  // Al acortar el plazo, los pagos hechos no pueden quedarse por encima.
  useEffect(() => {
    if (monthsTotal > 0 && monthsPaid > monthsTotal) setValue('months_paid', String(monthsTotal))
  }, [monthsTotal, monthsPaid, setValue])

  // Un error en un campo que está dentro de «Más opciones» no se puede quedar
  // escondido: se abre para que se vea.
  useEffect(() => {
    if (errors.months_paid || errors.start_date) setMasOpciones(true)
  }, [errors.months_paid, errors.start_date])

  // El plazo actual puede no estar en la lista (un plan viejo de 10 meses).
  const plazos = [...new Set<number>([...PLAZOS, ...(monthsTotal > 0 ? [monthsTotal] : [])])].sort((a, b) => a - b)

  async function guardar(values: FormValues) {
    setSaveError(null)
    const pagados = parseCountInput(values.months_paid) ?? 0
    const mTotal = parseCountInput(values.months_total) ?? 0
    const base = {
      name: values.name.trim(),
      total_amount: moneyOr(values.total_amount, 0),
      monthly_amount: monthlyAmount,
      months_total: mTotal,
      months_paid: pagados,
      is_zero_interest: values.is_zero_interest,
      account_id: values.account_id || null,
      start_date: values.start_date || undefined,
    }
    try {
      if (isEditing && onUpdate && editingInstallment) {
        await onUpdate(editingInstallment.id, { ...base, status: pagados >= mTotal ? 'paid' : 'active' })
        toast.success('Plan actualizado', `${base.name} · ${formatMXN(monthlyAmount)}/mes`)
      } else {
        await onSubmit({ ...base, charge_to_card: values.charge_to_card })
        toast.success('Compra a meses registrada', `${base.name} · ${formatMXN(monthlyAmount)}/mes`)
      }
      onDone()
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Error desconocido'
      setSaveError(msg)
      toast.error('Error al guardar', msg)
    }
  }

  const boton = (
    <div className="flex flex-col gap-2">
      {saveError && <p className="text-xs font-semibold text-debt-ink">• {saveError}</p>}
      <Button type="submit" form={formId} loading={isSubmitting}>
        {isEditing
          ? 'Guardar cambios'
          : monthlyAmount > 0
            ? `Registrar · ${formatMXN(monthlyAmount)}/mes`
            : 'Registrar compra a meses'}
      </Button>
    </div>
  )

  return (
    <form id={formId} onSubmit={handleSubmit(guardar)} className="flex flex-col gap-3" noValidate>
      <Input
        label="¿Qué compraste?"
        placeholder="iPhone, laptop, mueble…"
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Monto total"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          error={errors.total_amount?.message}
          // Texto y no type="number": su paso por omisión es 1 y rechaza "574.5", y
          // descarta la coma decimal antes de que el valor llegue al código.
          {...register('total_amount')}
        />
        <Select label="Meses" error={errors.months_total?.message} {...register('months_total')}>
          {plazos.map((m) => (
            <option key={m} value={m}>
              {m} meses
            </option>
          ))}
        </Select>
      </div>

      {monthlyAmount > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-primary-soft/50 px-3.5 py-2.5">
          <IconCalendarEvent size={16} className="shrink-0 text-primary-deep" />
          <span className="text-[13px] font-bold text-primary-deep">
            {formatMXN(monthlyAmount)}/mes durante {monthsTotal} meses
          </span>
        </div>
      )}

      {creditAccounts.length > 0 && (
        <Select label="Tarjeta" {...register('account_id')}>
          <option value="">Sin asociar</option>
          {creditAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      )}

      {/* ¿Esto ya está dentro del saldo de la tarjeta? Preguntarlo es el arreglo
          entero: la app siempre dio por hecho que sí, y nada lo ponía ahí. Sólo al
          crear: cambiarlo después es el caso ambiguo, así que no se ofrece. */}
      {!isEditing && selectedCard && (
        <Controller
          control={control}
          name="charge_to_card"
          render={({ field }) => (
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-text">¿Ya está en el saldo de la tarjeta?</p>
              <Segmented
                ariaLabel="¿Ya está en el saldo de la tarjeta?"
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: true, label: 'No, cárgalo' },
                  { value: false, label: 'Sí, ya está' },
                ]}
              />
              {pendingPrincipal > 0 && (
                <p className="mt-1.5 text-[12px] leading-snug text-text-secondary">
                  {chargeToCard ? (
                    <>
                      El saldo de <b className="text-text">{selectedCard.name}</b> pasa de{' '}
                      <b className="font-mono text-text">{formatMXN(Number(selectedCard.balance))}</b> a{' '}
                      <b className="font-mono text-text">{formatMXN(balanceAfter)}</b>.
                    </>
                  ) : (
                    <>No tocamos tu saldo. Úsalo si el saldo que capturaste ya salió de la app del banco y ya incluye esta compra.</>
                  )}
                </p>
              )}
            </div>
          )}
        />
      )}

      <button
        type="button"
        onClick={() => setMasOpciones((v) => !v)}
        aria-expanded={masOpciones}
        className="flex min-h-[40px] items-center justify-between rounded-xl px-1 text-[13px] font-bold text-primary-deep"
      >
        Más opciones
        <IconChevronDown size={16} className={clsx('transition-transform motion-reduce:transition-none', masOpciones && 'rotate-180')} />
      </button>

      {masOpciones && (
        <div className="flex animate-[fade-in_160ms_ease-out] flex-col gap-3 motion-reduce:animate-none">
          <Select
            label="Pagos ya hechos"
            error={errors.months_paid?.message}
            {...register('months_paid')}
          >
            {Array.from({ length: Math.max(monthsTotal, 1) + 1 }, (_, i) => (
              <option key={i} value={i}>
                {i === 0 ? 'Ninguno todavía' : `${i} ${i === 1 ? 'pago' : 'pagos'}`}
              </option>
            ))}
          </Select>
          {monthsPaid > 0 && monthsTotal > monthsPaid && (
            <p className="-mt-1.5 text-[12px] text-text-secondary">Quedan {monthsTotal - monthsPaid} meses por pagar</p>
          )}

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-text">Tipo de plan</p>
            <Controller
              control={control}
              name="is_zero_interest"
              render={({ field }) => (
                <Segmented
                  ariaLabel="Tipo de plan"
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: true, label: 'MSI sin interés' },
                    { value: false, label: 'Con interés', tone: 'debt' },
                  ]}
                />
              )}
            />
            {!isZeroInterest && (
              <p className="mt-1.5 text-[12px] text-text-secondary">Escribe el monto total ya con los intereses.</p>
            )}
          </div>

          <Input label="Fecha de inicio" type="date" max={toKey(new Date())} className="w-full min-w-0" {...register('start_date')} />
        </div>
      )}

      {footerTarget !== undefined ? <FooterPortal target={footerTarget}>{boton}</FooterPortal> : boton}
    </form>
  )
}
