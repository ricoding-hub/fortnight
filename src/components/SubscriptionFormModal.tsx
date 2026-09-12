import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { BrandLogo } from '@/components/BrandLogo'
import { SUBSCRIPTION_BRANDS, BRANDS, type Brand } from '@/lib/brands'
import { useToast } from '@/hooks/useToast'
import { useAccounts } from '@/hooks/useAccounts'
import { isCountInput, isMoneyInput, moneyOr, parseCountInput } from '@/lib/money'
import { useCategories } from '@/hooks/useCategories'
import type { Subscription, NewSubscription, SubscriptionFrequency, RecurringKind } from '@/types'

const isDay = (v: string) => isCountInput(v, 1, 31)
const isMoney = (v: string) => isMoneyInput(v)

const schema = z.object({
  name:       z.string().trim().min(1, 'Escribe un nombre'),
  amount:     z.string().refine(isMoney, 'Monto inválido'),
  frequency:  z.enum(['mensual', 'trimestral', 'anual']),
  charge_day: z.string().refine(isDay, 'Día entre 1 y 31'),
  account_id: z.string().optional(),
  notes:      z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export type SubFormMode =
  | { kind: 'create'; recurring: RecurringKind }
  | { kind: 'edit'; sub: Subscription }

/**
 * El mismo formulario sirve para una suscripción y para un gasto fijo: los dos
 * son un monto que se cobra cada tanto en un día del mes. Lo que cambia es el
 * vocabulario y qué se pregunta — a la renta no se le elige logo, se le elige
 * categoría, que es lo que evita contarla dos veces contra el presupuesto.
 */
const TEXTOS: Record<RecurringKind, {
  titulo: string
  tituloEditar: string
  nombre: string
  ejemplo: string
  dia: string
  guardado: string
  actualizado: string
}> = {
  suscripcion: {
    titulo: 'Nueva suscripción',
    tituloEditar: 'Editar suscripción',
    nombre: 'Nombre',
    ejemplo: 'Netflix, Gimnasio…',
    dia: 'Día de cobro',
    guardado: 'Suscripción guardada',
    actualizado: 'Suscripción actualizada',
  },
  fijo: {
    titulo: 'Nuevo gasto fijo',
    tituloEditar: 'Editar gasto fijo',
    nombre: '¿Qué pagas?',
    ejemplo: 'Renta, Luz, Internet…',
    dia: 'Día de pago',
    guardado: 'Gasto fijo guardado',
    actualizado: 'Gasto fijo actualizado',
  },
}

interface Props {
  mode: SubFormMode
  onClose: () => void
  onCreate: (sub: NewSubscription) => Promise<void>
  onUpdate: (id: string, sub: Partial<NewSubscription>) => Promise<void>
}

export function SubscriptionFormModal({ mode, onClose, onCreate, onUpdate }: Props) {
  const toast = useToast()
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const isCreate = mode.kind === 'create'

  const existing = mode.kind === 'edit' ? mode.sub : null
  const recurring: RecurringKind = mode.kind === 'create' ? mode.recurring : mode.sub.kind
  const esFijo = recurring === 'fijo'
  const t = TEXTOS[recurring]
  const categoriasFijas = categories.filter((c) => c.kind === 'fixed')
  const [categoriaId, setCategoriaId] = useState<string | null>(existing?.category_id ?? null)
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(
    existing?.brand_id ? (BRANDS.find((b) => b.id === existing.brand_id) ?? null) : null
  )
  const [freq, setFreq] = useState<SubscriptionFrequency>(existing?.frequency ?? 'mensual')
  const [search, setSearch] = useState('')

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:       existing?.name ?? '',
      amount:     existing?.amount != null ? String(existing.amount) : '',
      frequency:  existing?.frequency ?? 'mensual',
      charge_day: existing?.charge_day != null ? String(existing.charge_day) : '',
      account_id: existing?.account_id ?? '',
      notes:      existing?.notes ?? '',
    },
  })

  function pickBrand(b: Brand) {
    setSelectedBrand(b)
    setValue('name', b.name, { shouldValidate: true })
  }

  async function onSubmit(values: FormValues) {
    const payload: NewSubscription = {
      name:       values.name.trim(),
      amount:     moneyOr(values.amount, 0),
      frequency:  freq,
      charge_day: parseCountInput(values.charge_day) ?? 1,
      account_id: values.account_id || null,
      brand_id:   selectedBrand?.id ?? null,
      color:      selectedBrand?.color ?? null,
      // La categoría es lo que permite descontar este gasto del presupuesto en
      // vez de sumarlo encima de lo ya presupuestado.
      category_id: esFijo ? categoriaId : null,
      kind:       recurring,
      notes:      values.notes?.trim() || null,
      active:     true,
    }
    try {
      if (isCreate) {
        await onCreate(payload)
        toast.success(t.guardado, payload.name)
      } else {
        await onUpdate(existing!.id, payload)
        toast.success(t.actualizado, payload.name)
      }
      onClose()
    } catch {
      toast.error('Error al guardar', 'Intenta de nuevo')
    }
  }

  const filtered = search
    ? SUBSCRIPTION_BRANDS.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
    : SUBSCRIPTION_BRANDS

  const FREQS: { value: SubscriptionFrequency; label: string }[] = [
    { value: 'mensual',     label: 'Mensual' },
    { value: 'trimestral',  label: 'Trimestral' },
    { value: 'anual',       label: 'Anual' },
  ]

  return (
    <Modal open title={isCreate ? t.titulo : t.tituloEditar} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">

        {/* Brand picker — a la renta no se le elige logo. */}
        {!esFijo && (
        <div>
          <p className="mb-2 text-[12px] font-semibold text-text-secondary">Servicio</p>
          <input
            type="text"
            placeholder="Buscar servicio…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2 w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-[13px] text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex flex-wrap gap-1.5">
            {filtered.map((b) => {
              const sel = selectedBrand?.id === b.id
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => pickBrand(b)}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11.5px] font-bold transition-all"
                  style={
                    sel
                      ? { background: b.color, color: '#fff', boxShadow: `0 4px 10px ${b.color}55` }
                      : { background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }
                  }
                >
                  <BrandLogo brandId={b.id} name={b.name} size={16} />
                  {b.name}
                </button>
              )
            })}
          </div>
        </div>
        )}

        {/* Categoría — sólo para gastos fijos, y es lo que evita contarlos dos
            veces: una en el presupuesto y otra aquí. */}
        {esFijo && categoriasFijas.length > 0 && (
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-text-secondary">Categoría</p>
            <div className="flex flex-wrap gap-1.5">
              {categoriasFijas.map((c) => {
                const sel = categoriaId === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoriaId(sel ? null : c.id)}
                    className={
                      'rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-all ' +
                      (sel ? 'bg-primary text-white' : 'bg-bg-secondary text-text-secondary')
                    }
                  >
                    {c.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <Input
          label={t.nombre}
          placeholder={t.ejemplo}
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="Monto"
          inputMode="decimal"
          placeholder="0.00"
          error={errors.amount?.message}
          {...register('amount')}
        />

        {/* Frequency */}
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-text-secondary">Frecuencia</p>
          <div className="grid grid-cols-3 gap-1">
            {FREQS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => { setFreq(value); setValue('frequency', value) }}
                className={
                  'rounded-xl py-2.5 text-[12px] font-bold transition-all ' +
                  (freq === value
                    ? 'bg-primary text-white shadow-[0_4px_10px_rgba(99,102,241,0.3)]'
                    : 'bg-bg-secondary text-text-secondary')
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Input
          label={t.dia}
          inputMode="numeric"
          placeholder="1–31"
          error={errors.charge_day?.message}
          {...register('charge_day')}
        />

        {/* Account selector */}
        {accounts.length > 0 && (
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-text-secondary">Cuenta de cargo (opcional)</p>
            <select
              {...register('account_id')}
              className="w-full rounded-xl border border-border bg-bg-secondary px-3 py-2.5 text-[13px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Sin cuenta específica</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        <Button type="submit" loading={isSubmitting} className="mt-1">
          {isCreate ? 'Guardar suscripción' : 'Guardar cambios'}
        </Button>
      </form>
    </Modal>
  )
}
