import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
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
import { guardarPref, prefValida } from '@/lib/addPrefs'
import { toKey } from '@/lib/calendar'
import { compraParecida, type MovEdc } from '@/lib/estadoDeCuenta'
import { formatMXN } from '@/lib/format'
import { isCountInput, isMoneyInput, moneyOr, parseCountInput } from '@/lib/money'
import { fechaCorta } from '@/lib/movementDates'
import { calendarioMsi, nuevoCargo, registradoEl, type InstallmentVivo } from '@/lib/msi'
import type { InstallmentPatch, NewInstallment } from '@/hooks/useInstallments'
import type { SemillaMeses } from '@/store/uiStore'
import type { Account, Installment } from '@/types'

const schema = z.object({
  name: z.string().trim().min(1, 'Escribe qué compraste'),
  total_amount: z.string().refine((v) => isMoneyInput(v), 'Escribe un monto, por ejemplo 574.50'),
  months_total: z.string().refine((v) => isCountInput(v, 1, 120), 'Entre 1 y 120 meses'),
  is_zero_interest: z.boolean(),
  charge_to_card: z.boolean(),
  account_id: z.string().optional(),
  // La fecha de compra decide en qué mensualidad vas: es lo que antes se
  // capturaba a mano como «pagos ya hechos».
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Elige la fecha de compra')
    .refine((v) => v <= toKey(new Date()), 'La compra no puede ser en el futuro'),
  billing_offset: z.string(),
})

type FormValues = z.infer<typeof schema>

/** Plazos que ofrecen las tiendas. Un select, no un campo numérico. */
const PLAZOS = [3, 6, 9, 12, 15, 18, 24] as const

interface InstallmentFieldsProps {
  /** `id` del <form>, para asociar el botón del pie. */
  formId: string
  accounts: Account[]
  /** Contenedor del pie fijo donde va el botón. Sin él, el botón va en línea. */
  footerTarget?: HTMLElement | null
  editingInstallment?: InstallmentVivo
  onSubmit: (data: NewInstallment) => Promise<void>
  onUpdate?: (id: string, patch: InstallmentPatch) => Promise<unknown>
  /** Tras guardar: cerrar el modal o la hoja. */
  onDone: () => void
  /**
   * Una compra ya conocida. Con `txId` se convierte ese gasto en el cargo del
   * plan; sin él, sólo llena los campos («¿Fue a meses?» desde un gasto).
   */
  semilla?: SemillaMeses
  /** Movimientos recientes de las tarjetas, para avisar si la compra ya está registrada. */
  movimientos?: MovEdc[]
}

/**
 * Los campos de una compra a meses.
 *
 * Salen de `InstallmentFormModal` para que la misma lógica — la validación, el
 * "¿ya está en el saldo?", la vista previa — sirva en el modal de editar un plan
 * y en la hoja «Agregar», en lugar de existir dos veces y divergir.
 *
 * Lo común queda a la vista: qué, cuánto, cuántos meses, tarjeta y fecha de
 * compra. Con la fecha y el corte de la tarjeta, la vista previa dice cuándo
 * entra la primera mensualidad y en cuál vas — antes eso se capturaba a mano
 * como «pagos ya hechos», y se desfasaba con cada mes que pasaba.
 */
export function InstallmentFields({
  formId,
  accounts,
  footerTarget,
  editingInstallment,
  onSubmit,
  onUpdate,
  onDone,
  semilla,
  movimientos,
}: InstallmentFieldsProps) {
  const isEditing = editingInstallment != null
  const creditAccounts = accounts.filter((a) => a.type === 'credit')
  // La tarjeta de la última compra a meses, o la única. Antes quedaba «Sin
  // asociar» y el plan no tenía corte, ni cargo, ni estado de cuenta.
  const tarjetaPorOmision =
    creditAccounts.length === 1
      ? creditAccounts[0].id
      : (prefValida('msi:tarjeta', creditAccounts.map((a) => a.id)) ?? '')
  // El gasto que este plan convierte (en vez de cargar la compra otra vez).
  const [adoptado, setAdoptado] = useState<{ id: string; accountId: string } | null>(
    semilla?.txId ? { id: semilla.txId, accountId: semilla.accountId } : null,
  )
  const [noEsEse, setNoEsEse] = useState<string | null>(null)
  const toast = useToast()
  const [saveError, setSaveError] = useState<string | null>(null)
  // Editar quiere ver todo; registrar algo nuevo, lo mínimo.
  const [masOpciones, setMasOpciones] = useState(isEditing)

  const {
    register,
    handleSubmit,
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
          is_zero_interest: editingInstallment.is_zero_interest,
          account_id: editingInstallment.account_id ?? '',
          start_date: String(editingInstallment.start_date ?? '').slice(0, 10) || toKey(new Date()),
          billing_offset: String(editingInstallment.billing_offset ?? 0),
          charge_to_card: false,
        }
      : {
          name: semilla?.name ?? '',
          total_amount: semilla?.total ? String(semilla.total) : '',
          months_total: '12',
          is_zero_interest: true,
          charge_to_card: !semilla?.txId,
          account_id: semilla?.accountId ?? tarjetaPorOmision,
          start_date: semilla?.date ?? toKey(new Date()),
          billing_offset: '0',
        },
  })

  const [totalAmountStr, monthsTotalStr, isZeroInterest, chargeToCard, accountId, startDate, offsetStr] = useWatch({
    control,
    name: ['total_amount', 'months_total', 'is_zero_interest', 'charge_to_card', 'account_id', 'start_date', 'billing_offset'],
  })

  // `Number()` a secas convierte "574,5" en NaN, que vaciaba la vista previa en
  // silencio y habría escrito NaN en la fila al guardar.
  const totalAmount = moneyOr(totalAmountStr, 0)
  const monthsTotal = parseCountInput(monthsTotalStr ?? '') ?? 0
  const offset = parseCountInput(offsetStr ?? '0') ?? 0
  const monthlyAmount =
    totalAmount > 0 && monthsTotal > 0 ? Math.round((totalAmount / monthsTotal) * 100) / 100 : 0

  const selectedCard = creditAccounts.find((a) => a.id === accountId)
  const hoy = toKey(new Date())
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(startDate ?? '') && (startDate ?? '') <= hoy

  // El plan como quedaría, para la vista previa: en qué corte entra, en cuál
  // mensualidad vas, cuándo termina y cuánto se carga a la tarjeta.
  const borrador: Installment | null =
    monthlyAmount > 0 && fechaValida
      ? {
          ...(editingInstallment ?? {
            id: 'borrador', user_id: '', name: '', status: 'active', months_paid: 0,
            created_at: new Date().toISOString(), updated_at: '', month_status: { _v: 2 },
          }),
          total_amount: totalAmount,
          monthly_amount: monthlyAmount,
          months_total: monthsTotal,
          account_id: accountId || null,
          start_date: startDate!,
          is_zero_interest: isZeroInterest,
          billing_offset: offset,
        } as Installment
      : null
  const cal = borrador ? calendarioMsi(borrador, selectedCard ?? null, hoy) : null
  const primera = cal?.meses[0] ?? null
  const pendingPrincipal = cal?.restante ?? 0
  const balanceAfter = selectedCard ? Number(selectedCard.balance) + pendingPrincipal : 0

  // Al editar, lo que le pasa al cargo de la tarjeta, dicho antes de guardar.
  const cargo = editingInstallment?.cargo ?? null
  let efectoCargo: string | null = null
  if (isEditing && cargo && borrador && editingInstallment) {
    const nuevaTarjeta = accountId || null
    if (!nuevaTarjeta) {
      efectoCargo = `Se quita el cargo de ${formatMXN(cargo.amount)} de la tarjeta.`
    } else {
      const monto = nuevoCargo(
        cargo.amount,
        [editingInstallment, editingInstallment.ciclo],
        [borrador, selectedCard ?? null],
        registradoEl(editingInstallment, hoy),
      )
      const mueve = nuevaTarjeta !== cargo.account_id
      if (mueve) efectoCargo = `El cargo de ${formatMXN(monto)} se mueve a ${selectedCard?.name ?? 'la otra tarjeta'}.`
      else if (Math.abs(monto - cargo.amount) >= 0.005) {
        efectoCargo = `El cargo en ${selectedCard?.name ?? 'la tarjeta'} pasa de ${formatMXN(cargo.amount)} a ${formatMXN(monto)}.`
      }
    }
  }

  // ¿Ya está registrada? Un gasto parecido en esa tarjeta (±$1, ±3 días): se
  // ofrece convertirlo. Cargarla otra vez duplicaba la compra en el saldo.
  const parecida =
    !isEditing && !adoptado && selectedCard && totalAmount > 0 && fechaValida && movimientos
      ? compraParecida(movimientos, { accountId: selectedCard.id, total: totalAmount, fecha: startDate! })
      : null
  const sugerirConvertir = parecida && parecida.id !== noEsEse ? parecida : null

  // Un error en un campo que está dentro de «Más opciones» no se puede quedar
  // escondido: se abre para que se vea.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (errors.billing_offset) setMasOpciones(true)
  }, [errors.billing_offset])

  // El plazo actual puede no estar en la lista (un plan viejo de 10 meses).
  const plazos = [...new Set<number>([...PLAZOS, ...(monthsTotal > 0 ? [monthsTotal] : [])])].sort((a, b) => a - b)

  async function guardar(values: FormValues) {
    setSaveError(null)
    const mTotal = parseCountInput(values.months_total) ?? 0
    const base = {
      name: values.name.trim(),
      total_amount: moneyOr(values.total_amount, 0),
      monthly_amount: monthlyAmount,
      months_total: mTotal,
      is_zero_interest: values.is_zero_interest,
      // Al convertir un gasto, el plan va en la tarjeta de ese gasto.
      account_id: adoptado?.accountId ?? (values.account_id || null),
      start_date: values.start_date,
      billing_offset: parseCountInput(values.billing_offset) ?? 0,
    }
    try {
      if (isEditing && onUpdate && editingInstallment) {
        await onUpdate(editingInstallment.id, base)
        toast.success('Plan actualizado', `${base.name} · ${formatMXN(monthlyAmount)}/mes`)
      } else {
        await onSubmit({
          ...base,
          charge_to_card: adoptado ? false : values.charge_to_card,
          ...(adoptado ? { adopt_tx_id: adoptado.id } : {}),
        })
        if (base.account_id) guardarPref('msi:tarjeta', base.account_id)
        toast.success(
          adoptado ? 'Gasto convertido a meses' : 'Compra a meses registrada',
          `${base.name} · ${formatMXN(monthlyAmount)}/mes`,
        )
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
          : adoptado
            ? `Convertir a ${monthsTotal} meses${monthlyAmount > 0 ? ` · ${formatMXN(monthlyAmount)}/mes` : ''}`
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

      {creditAccounts.length > 0 && !adoptado && (
        <Select label="Tarjeta" {...register('account_id')}>
          <option value="">Sin asociar</option>
          {creditAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      )}

      <Input
        label="Fecha de compra"
        type="date"
        max={hoy}
        className="w-full min-w-0"
        error={errors.start_date?.message}
        {...register('start_date')}
      />

      {cal && primera && (
        <div className="flex gap-2.5 rounded-xl bg-primary-soft/50 px-3.5 py-3" aria-live="polite">
          <IconCalendarEvent size={17} className="mt-0.5 shrink-0 text-primary-deep" />
          <div className="flex min-w-0 flex-col gap-0.5 text-[13px] leading-snug text-primary-deep">
            <span className="font-bold">
              {formatMXN(monthlyAmount)}/mes durante {monthsTotal} meses
            </span>
            {cal.terminado ? (
              <span>Según las fechas, ya la terminaste de pagar.</span>
            ) : (
              <>
                <span>
                  1ª mensualidad:{' '}
                  {primera.corte ? `corte del ${fechaCorta(primera.corte)} · ` : ''}vence el {fechaCorta(primera.vence)}
                  {primera.venceEstimado ? ' (aprox.)' : ''}
                </span>
                {cal.pagadas > 0 && cal.actual && (
                  <span>
                    Vas en la mensualidad {cal.actual.n} de {monthsTotal} · {cal.pagadas} ya pagada{cal.pagadas === 1 ? '' : 's'}
                  </span>
                )}
                <span>Termina el {fechaCorta(cal.termina)}</span>
              </>
            )}
            {!selectedCard && accountId === '' && creditAccounts.length > 0 && (
              <span className="text-[12px] text-text-secondary">Elige la tarjeta para usar sus fechas de corte y pago.</span>
            )}
          </div>
        </div>
      )}

      {efectoCargo && (
        <p className="rounded-xl bg-bg-secondary px-3.5 py-2.5 text-[12.5px] text-text-secondary">{efectoCargo}</p>
      )}

      {/* ¿Esto ya está dentro del saldo de la tarjeta? Preguntarlo es el arreglo
          entero: la app siempre dio por hecho que sí, y nada lo ponía ahí. Sólo al
          crear: cambiarlo después es el caso ambiguo, así que no se ofrece. */}
      {sugerirConvertir && selectedCard && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-3" role="status">
          <p className="text-[12.5px] leading-snug text-text">
            ¿Es este? Ya tienes un gasto de <b className="font-mono">{formatMXN(Number(sugerirConvertir.amount))}</b> en{' '}
            {selectedCard.name} el {fechaCorta(sugerirConvertir.date.slice(0, 10))}
            {sugerirConvertir.description ? ` («${sugerirConvertir.description}»)` : ''}. Si es la misma compra, conviértelo
            en vez de cargarla otra vez.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" compact onClick={() => setAdoptado({ id: sugerirConvertir.id, accountId: selectedCard.id })}>
              Sí, convertir ese gasto
            </Button>
            <Button type="button" compact variant="secondary" onClick={() => setNoEsEse(sugerirConvertir.id)}>
              No, es otra compra
            </Button>
          </div>
        </div>
      )}

      {adoptado && selectedCard && (
        <div className="rounded-xl bg-asset-soft/50 px-3.5 py-2.5 text-[12.5px] leading-snug text-text">
          Tu gasto ya registrado en <b>{selectedCard.name}</b> pasa a ser el cargo de este plan: el saldo no cambia, y
          tu estado de cuenta ya no lo pide completo, sólo sus mensualidades.
          {!semilla?.txId && (
            <button type="button" onClick={() => setAdoptado(null)} className="ml-1 min-h-[32px] font-bold text-primary-deep">
              Deshacer
            </button>
          )}
        </div>
      )}

      {!isEditing && !adoptado && selectedCard && (
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

          {selectedCard?.cut_day != null && (
            <Select label="Primera mensualidad" error={errors.billing_offset?.message} {...register('billing_offset')}>
              <option value="0">En el siguiente corte</option>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'corte' : 'cortes'} después (promoción)
                </option>
              ))}
            </Select>
          )}
        </div>
      )}

      {footerTarget !== undefined ? <FooterPortal target={footerTarget}>{boton}</FooterPortal> : boton}
    </form>
  )
}
